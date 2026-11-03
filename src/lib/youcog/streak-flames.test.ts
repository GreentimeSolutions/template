import { test } from "node:test";
import assert from "node:assert/strict";
import { flameTier, streakTransition } from "./streak-flames.ts";

test("flame tiers", () => {
  assert.deepEqual([0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 99].map(flameTier), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});
test("tier transitions", () => {
  assert.deepEqual(streakTransition(6, 7), { kind: "up", tier: 3, streak: 7 });
  assert.equal(streakTransition(7, 8), null);
  assert.equal(streakTransition(0, 1), null);
  assert.deepEqual(streakTransition(12, 1), { kind: "reset" });
});
