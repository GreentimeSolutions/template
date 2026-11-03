/**
 * Cosmetics store (PREVIEW ONLY). Pure helpers, no wallet, token or contract calls.
 * Purchases are simulated against a mock balance. In the real version, spent YOUCOG
 * goes back to the faucet.
 */
import { BUY_ONLY, COSMETICS, QUEST_ONLY, RARITY_PRICE, STORE_EXTRAS, type Category, type Cosmetic } from "./ghost-wardrobe";

export type StoreTab = "hats" | "eyes" | "body" | "accessories" | "trails" | "seasonal";
export const STORE_TABS: { id: StoreTab; label: string; icon: string }[] = [
  { id: "hats", label: "Hats", icon: "🎩" }, { id: "eyes", label: "Eyes", icon: "🕶" }, { id: "body", label: "Body", icon: "👻" },
  { id: "accessories", label: "Accessories", icon: "🦆" }, { id: "trails", label: "Trails", icon: "✨" }, { id: "seasonal", label: "Seasonal", icon: "🎃" },
];
const TAB_CATS: Record<Exclude<StoreTab, "seasonal">, Category[]> = {
  hats: ["hat"], eyes: ["shades"], body: ["skin", "aura"], accessories: ["prop"], trails: ["trail"],
};
export type StoreItem = Cosmetic & { seasonal?: boolean; price: number; questOnly?: string; buyOnly: boolean };
const QUEST_EXTRA: Record<string, string> = { "prop-medal": "Collect 10 medals", "prop-badge": "Mint your ghost" };

export const STORE_ITEMS: StoreItem[] = [...COSMETICS, ...STORE_EXTRAS].map((c) => {
  const questOnly = QUEST_ONLY[c.id] ?? QUEST_EXTRA[c.id];
  return { ...c, price: RARITY_PRICE[c.rarity], questOnly, buyOnly: BUY_ONLY.includes(c.id) || !!(c as { seasonal?: boolean }).seasonal };
});
export const itemsForTab = (t: StoreTab) =>
  t === "seasonal" ? STORE_ITEMS.filter((i) => i.seasonal) : STORE_ITEMS.filter((i) => !i.seasonal && TAB_CATS[t].includes(i.cat));

export type BuyResult = { ok: true; balance: number; owned: string[] } | { ok: false; reason: "quest-only" | "owned" | "insufficient" };
/** SIMULATED purchase against a mock balance. */
export function simulateBuy(item: StoreItem, balance: number, owned: string[]): BuyResult {
  if (item.questOnly) return { ok: false, reason: "quest-only" };
  if (owned.includes(item.id)) return { ok: false, reason: "owned" };
  if (balance < item.price) return { ok: false, reason: "insufficient" };
  return { ok: true, balance: balance - item.price, owned: [...owned, item.id] };
}
