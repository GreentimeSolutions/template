import { test } from "node:test";
import assert from "node:assert/strict";
import { holdsYcurv, ycurvBonusExtra } from "./ycurv-bonus-core";
import { FAUCET_AMOUNTS } from "../../constants/faucet";
import { streakMultiplier } from "./streak-core";

const E = 10n ** 18n;

test("extra is 25% of the tier, capped at 2,500", () => {
  assert.deepEqual(FAUCET_AMOUNTS.map((t) => ycurvBonusExtra(t)), [210, 555, 2500]);
});

test("extra adds on top of the streak amount, never multiplied by it", () => {
  const tier = 13938;
  const day7 = Math.round(tier * streakMultiplier(7)) + ycurvBonusExtra(tier);
  assert.equal(day7, 41814 + 2500);
  const day1 = Math.round(840 * streakMultiplier(1)) + ycurvBonusExtra(840);
  assert.equal(day1, 1050);
});

test("must hold the minimum now AND at the look-back time", () => {
  const min = 10n * E;
  assert.equal(holdsYcurv(10n * E, 10n * E, min), true);
  assert.equal(holdsYcurv(10n * E, 0n, min), false); // bought just now
  assert.equal(holdsYcurv(0n, 50n * E, min), false); // sold or passed on before claiming
  assert.equal(holdsYcurv(9n * E, 100n * E, min), false);
  assert.equal(holdsYcurv(5n, 5n, 0n), false);
});

test("bad inputs pay no extra", () => {
  assert.equal(ycurvBonusExtra(0), 0);
  assert.equal(ycurvBonusExtra(Number.NaN), 0);
  assert.equal(ycurvBonusExtra(840, 0), 0);
});
