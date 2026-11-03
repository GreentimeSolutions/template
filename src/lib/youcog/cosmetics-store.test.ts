import { test } from "node:test";
import assert from "node:assert/strict";
import { STORE_ITEMS, STORE_TABS, itemsForTab, simulateBuy } from "./cosmetics-store";

test("every item lands in exactly one tab", () => {
  const n = STORE_TABS.reduce((a, t) => a + itemsForTab(t.id).length, 0);
  assert.equal(n, STORE_ITEMS.length);
});
test("quest-only items cannot be bought", () => {
  for (const id of ["shades-red", "aura-base", "trail-code", "skin-glitch", "prop-medal", "prop-badge"]) {
    const it = STORE_ITEMS.find((i) => i.id === id)!;
    assert.ok(it.questOnly);
    assert.deepEqual(simulateBuy(it, 1e9, []), { ok: false, reason: "quest-only" });
  }
});
test("simulated buy deducts price and blocks repeats / low balance", () => {
  const crown = STORE_ITEMS.find((i) => i.id === "crown")!;
  assert.equal(crown.price, 10000);
  assert.ok(crown.buyOnly);
  const r = simulateBuy(crown, 15000, []);
  assert.ok(r.ok && r.balance === 5000 && r.owned.includes("crown"));
  assert.deepEqual(simulateBuy(crown, 15000, ["crown"]), { ok: false, reason: "owned" });
  assert.deepEqual(simulateBuy(crown, 50, []), { ok: false, reason: "insufficient" });
});

import { QUESTS, QUEST_FOR_ITEM, longestRun, progress, EMPTY_SIGNALS } from "./quests-core";
test("18 quests and every quest-only item has one", () => {
  assert.equal(QUESTS.length, 18);
  for (const id of ["shades-red", "aura-base", "trail-code", "skin-glitch", "prop-medal", "prop-badge"]) assert.ok(QUEST_FOR_ITEM[id], id);
  for (const q of QUESTS) assert.ok(STORE_ITEMS.find((i) => i.id === q.reward), q.reward);
});
test("longestRun finds best streak across gaps", () => {
  assert.equal(longestRun(new Set()), 0);
  assert.equal(longestRun(new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])), 4);
});
test("progress uses real signals, local inventory and simulated toggles", () => {
  const l = { owned: [], bought: 0, categoriesOwned: 3 };
  const s7 = QUESTS.find((q) => q.id === "streak7")!;
  assert.deepEqual(progress(s7, { ...EMPTY_SIGNALS, longestStreak: 11 }, l), { have: 7, goal: 7, pct: 100, done: true });
  assert.equal(progress(s7, { ...EMPTY_SIGNALS, longestStreak: 3 }, l).pct, 43);
  const mint = QUESTS.find((q) => q.id === "mint")!;
  assert.equal(progress(mint, EMPTY_SIGNALS, l).done, false);
  assert.equal(progress(mint, EMPTY_SIGNALS, l, ["mint"]).done, true);
  assert.equal(progress(QUESTS.find((q) => q.id === "allcats")!, EMPTY_SIGNALS, l).have, 3);
});
