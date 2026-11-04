/** Ghost Shop server: verify a YOUCOG transfer on Base, then record cosmetic ownership. */
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import type { Sql } from "../db";
import { isAddr, isTxHash, verifyPurchase, type Receipt } from "./shop-verify-core";

export type BuyOutcome =
  | { status: 200; body: { ok: true; itemId: string; owned: string[] } }
  | { status: 202; body: { ok: false; pending: true; error: string } }
  | { status: 400 | 409 | 422 | 503; body: { ok: false; code: string; error: string } };

export type ReceiptFetcher = (hash: string) => Promise<Receipt | null>;
export const baseReceipt: ReceiptFetcher = async (hash) => {
  const pub = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org") });
  try { return (await pub.getTransactionReceipt({ hash: hash as Hex })) as unknown as Receipt; }
  catch (e) { if (/could not be found|not found/i.test(String((e as Error)?.message))) return null; throw e; }
};

export async function ownedItems(sql: Sql, address: string): Promise<string[]> {
  const rows = await sql<{ item_id: string }>`select distinct item_id from cosmetic_purchases where address = ${address.toLowerCase()}`;
  return rows.map((r) => r.item_id);
}

export async function recordPurchase(input: { address?: unknown; itemId?: unknown; txHash?: unknown }, fetchReceipt: ReceiptFetcher = baseReceipt, sqlIn?: Sql): Promise<BuyOutcome> {
  const { address, itemId, txHash } = input;
  if (!isAddr(address) || typeof itemId !== "string" || !isTxHash(txHash)) return { status: 400, body: { ok: false, code: "bad-input", error: "Need a wallet address, item and transaction hash." } };
  const sql = sqlIn ?? (await (await import("../db")).getSql());
  const hash = txHash.toLowerCase();
  const prior = await sql<{ address: string; item_id: string }>`select address, item_id from cosmetic_purchases where tx_hash = ${hash}`;
  if (prior.length) {
    if (prior[0].address === address.toLowerCase() && prior[0].item_id === itemId) return { status: 200, body: { ok: true, itemId, owned: await ownedItems(sql, address) } };
    return { status: 409, body: { ok: false, code: "reused", error: "That transaction was already used for a purchase." } };
  }
  let rc: Receipt | null;
  try { rc = await fetchReceipt(hash); } catch { return { status: 503, body: { ok: false, code: "rpc", error: "Couldn't reach Base right now. Try verifying again." } }; }
  if (!rc) return { status: 202, body: { ok: false, pending: true, error: "Transaction not confirmed yet. Try verifying again in a moment." } };
  const v = verifyPurchase(rc, address, itemId);
  if (!v.ok) return { status: v.code === "bad-input" ? 400 : 422, body: { ok: false, code: v.code, error: v.error } };
  const ins = await sql`insert into cosmetic_purchases (tx_hash, address, item_id, amount_wei, block_number)
    values (${hash}, ${address.toLowerCase()}, ${itemId}, ${v.amount.toString()}, ${rc.blockNumber.toString()})
    on conflict (tx_hash) do nothing returning tx_hash`;
  if (!ins.length) return { status: 409, body: { ok: false, code: "reused", error: "That transaction was already used for a purchase." } };
  return { status: 200, body: { ok: true, itemId, owned: await ownedItems(sql, address) } };
}
