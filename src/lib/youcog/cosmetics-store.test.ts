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
