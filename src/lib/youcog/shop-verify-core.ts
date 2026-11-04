/** Ghost Shop purchase verification (pure). Server-side prices only; never trusts client amounts. */
import { STORE_ITEMS } from "./cosmetics-store";
import { DEFAULT_OWNED } from "./ghost-wardrobe";

export const YOUCOG_TOKEN = "0x92bff5d88157114dfc4a0a00f3496aa7e2e7eba3";
export const FAUCET_ADDRESS = "0x3067ab541253746ab353b842fdc0970ffbde13c7";
export const YOUCOG_DECIMALS = 18n; // checked on-chain: decimals() = 18
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type Log = { address: string; topics: readonly string[]; data: string };
export type Receipt = { status: "success" | "reverted"; logs: readonly Log[]; blockNumber: bigint };
export type Verdict =
  | { ok: true; amount: bigint }
  | { ok: false; code: "bad-input" | "not-for-sale" | "failed-tx" | "no-transfer" | "too-little"; error: string };

/** Price in wei for a buyable item, or null if it can't be bought (quest-only, starter, unknown). */
export function priceWei(itemId: string): bigint | null {
  const it = STORE_ITEMS.find((i) => i.id === itemId);
  if (!it || it.questOnly || DEFAULT_OWNED.includes(itemId)) return null;
  return BigInt(it.price) * 10n ** YOUCOG_DECIMALS;
}
const topicAddr = (t?: string) => (t && t.length === 66 ? `0x${t.slice(26)}`.toLowerCase() : "");
export const isTxHash = (h: unknown): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
export const isAddr = (a: unknown): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);

export function verifyPurchase(receipt: Receipt, buyer: string, itemId: string): Verdict {
  if (!isAddr(buyer)) return { ok: false, code: "bad-input", error: "Bad wallet address." };
  const price = priceWei(itemId);
  if (price === null) return { ok: false, code: "not-for-sale", error: "That item can't be bought." };
  if (receipt.status !== "success") return { ok: false, code: "failed-tx", error: "That transaction failed on-chain." };
  const from = buyer.toLowerCase();
  let paid = 0n;
  for (const l of receipt.logs) {
    if (l.address.toLowerCase() !== YOUCOG_TOKEN || l.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || l.topics.length !== 3) continue;
    if (topicAddr(l.topics[1]) !== from || topicAddr(l.topics[2]) !== FAUCET_ADDRESS) continue;
    paid += BigInt(l.data === "0x" ? 0 : l.data);
  }
  if (paid === 0n) return { ok: false, code: "no-transfer", error: "No YOUCOG transfer from this wallet to the faucet in that transaction." };
  if (paid < price) return { ok: false, code: "too-little", error: "That transfer was less than the item's price." };
  return { ok: true, amount: paid };
}
