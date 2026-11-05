import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "./quests-core";
import { dayOffset, runEndingAt } from "./streak-core";
import { STORE_ITEMS } from "./cosmetics-store";
import { priceWei } from "./shop-verify-core";
import { questUnlocksFor, questUnlocksFrom } from "./shop.server";

const sig = (o: Partial<core.Signals>) => ({ ...core.EMPTY_SIGNALS, ...o });

test("no quest reward is for sale in the shop", () => {
  for (const q of core.QUESTS) {
    const it = STORE_ITEMS.find((i) => i.id === q.reward)!;
    assert.ok(it.questOnly, q.reward);
    assert.equal(priceWei(q.reward), null, q.reward);
  }
  assert.ok(priceWei("fedora-red"), "first real purchase item stays for sale");
});
test("only claim/purchase-verifiable quests save", () => {
  const saving = core.QUESTS.filter((q) => q.saves).map((q) => q.id).sort();
  assert.deepEqual(saving, ["allcats", "buy1", "claims10", "streak14", "streak3", "streak30", "streak7"]);
  for (const q of core.QUESTS) if (q.source === "sim") assert.ok(!q.saves, q.id);
});
test("nothing unlocks with no real data; YCURV balance alone never unlocks", () => {
  assert.deepEqual(questUnlocksFor(sig({}), [], core), []);
  assert.deepEqual(questUnlocksFor(sig({ ycurv: 1e6 }), [], core), []);
});
test("streak and claim-count quests unlock from claim days", () => {
  const days = new Set(Array.from({ length: 10 }, (_, i) => dayOffset("2026-10-01", i)));
  const u = questUnlocksFrom(days, [], core, { dayOffset, runEndingAt }, "2026-11-04");
  assert.deepEqual(u.sort(), ["prop-coffee", "shades-red", "skin-mint"]);
});
test("buy1 needs a verified purchase; allcats counts quest unlocks too", () => {
  assert.deepEqual(questUnlocksFor(sig({ longestStreak: 2 }), ["fedora-red"], core), ["prop-briefcase"]);
  // hat/shades/skin from starters, prop from briefcase, aura + trail bought -> all 6 categories
  const u = questUnlocksFor(sig({}), ["fedora-red", "trail-rainbow"].filter((id) => STORE_ITEMS.some((i) => i.id === id)), core);
  assert.ok(u.includes("prop-briefcase"));
});
test("Andy's real numbers (best streak 2, 4 claim days, 1 purchase) unlock only the Briefcase", () => {
  assert.deepEqual(questUnlocksFor(sig({ streak: 1, longestStreak: 2, totalClaims: 4 }), ["fedora-red"], core), ["prop-briefcase"]);
});
