/**
 * Cosmetics store (PREVIEW ONLY). Pure helpers, no wallet, token or contract calls.
 * Purchases are simulated against a mock balance. In the real version, spent YOUCOG
 * goes back to the faucet.
 */
import { QUEST_FOR_ITEM } from "./quests-core";
import { BUY_ONLY, COSMETICS, QUEST_ONLY, RARITY_PRICE, type Category, type Cosmetic } from "./ghost-wardrobe";

export type StoreTab = "hats" | "eyes" | "body" | "accessories" | "trails";
export const STORE_TABS: { id: StoreTab; label: string; icon: string }[] = [
  { id: "hats", label: "Hats", icon: "🎩" }, { id: "eyes", label: "Eyes", icon: "🕶" }, { id: "body", label: "Body", icon: "👻" },
  { id: "accessories", label: "Accessories", icon: "🦆" }, { id: "trails", label: "Trails", icon: "✨" },
];
const TAB_CATS: Record<StoreTab, Category[]> = {
  hats: ["hat"], eyes: ["shades"], body: ["skin", "aura"], accessories: ["prop"], trails: ["trail"],
};
export type StoreItem = Cosmetic & { price: number; questOnly?: string; buyOnly: boolean };

export const STORE_ITEMS: StoreItem[] = COSMETICS.map((c) => {
  const questOnly = QUEST_FOR_ITEM[c.id]?.name ?? QUEST_ONLY[c.id];
  return { ...c, price: RARITY_PRICE[c.rarity], questOnly, buyOnly: BUY_ONLY.includes(c.id) };
});
export const itemsForTab = (t: StoreTab) =>
  STORE_ITEMS.filter((i) => TAB_CATS[t].includes(i.cat));

export type BuyResult = { ok: true; balance: number; owned: string[] } | { ok: false; reason: "quest-only" | "owned" | "insufficient" };
/** SIMULATED purchase against a mock balance. */
export function simulateBuy(item: StoreItem, balance: number, owned: string[]): BuyResult {
  if (item.questOnly) return { ok: false, reason: "quest-only" };
  if (owned.includes(item.id)) return { ok: false, reason: "owned" };
  if (balance < item.price) return { ok: false, reason: "insufficient" };
  return { ok: true, balance: balance - item.price, owned: [...owned, item.id] };
}
