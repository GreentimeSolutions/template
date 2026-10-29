import { test } from "node:test";
import assert from "node:assert/strict";
import { claimStreak, cycleDay, dayOffset, isStreakBonusDay, regularMultiplier, streakBadge, streakMultiplier } from "./streak-core";
import { pickClaimAmount } from "./listen-core";
import { LISTEN_BONUS_AMOUNT, LISTEN_MIN_FAUCET_BALANCE } from "../../constants/listen";
import { FAUCET_AMOUNTS } from "../../constants/faucet";

const START = "2026-11-01";
/** Prior claim days: `n` consecutive days ending yesterday relative to `today`. */
function run(today: string, n: number): Set<string> {
  const s = new Set<string>();
  for (let i = 1; i <= n; i++) s.add(dayOffset(today, -i));
  return s;
}
const amountFor = (tier: number, streak: number) => Math.round(tier * streakMultiplier(streak));

test("streak 6 -> 7 pays 3x the tier", () => {
  const today = dayOffset(START, 6);
  const streak = claimStreak(run(today, 6), today);
  assert.equal(streak, 7);
  assert.equal(streakMultiplier(streak), 3);
  assert.deepEqual(FAUCET_AMOUNTS.map((t) => amountFor(t, streak)), [2520, 6666, 41814]);
});

test("day 6 is 1.25x, day 8 is back to the regular 1.5x", () => {
  assert.equal(streakMultiplier(6), 1.25);
  assert.equal(claimStreak(run("2026-11-10", 7), "2026-11-10"), 8);
  assert.equal(streakMultiplier(8), 1.5);
  assert.equal(amountFor(13938, 8), 20907);
});

test("every 7th day is 3x: 14, 21, 28; days between are regular", () => {
  for (const d of [7, 14, 21, 28, 70]) assert.equal(streakMultiplier(d), 3, `day ${d}`);
  for (const d of [1, 2, 3, 5, 9, 13, 15, 20, 22]) assert.ok(streakMultiplier(d) < 3, `day ${d}`);
  assert.equal(claimStreak(run("2026-11-20", 13), "2026-11-20"), 14);
  assert.equal(isStreakBonusDay(14), true);
  assert.equal(isStreakBonusDay(0), false);
  assert.equal(isStreakBonusDay(-7), false);
  assert.equal(regularMultiplier(14), 1.5);
});

test("a missed day resets the streak, so the next 3x is 7 days out again", () => {
  const today = "2026-11-15";
  const days = run(today, 6);
  days.delete(dayOffset(today, -1)); // missed yesterday
  assert.equal(claimStreak(days, today), 1);
  assert.equal(streakMultiplier(1), 1);
  // Gap in the middle: only the days after the gap count.
  const gap = run(today, 10);
  gap.delete(dayOffset(today, -4));
  assert.equal(claimStreak(gap, today), 4);
});

test("today's own claim is not double-counted", () => {
  const today = "2026-11-15";
  const days = run(today, 6);
  days.add(today);
  assert.equal(claimStreak(days, today), 7);
});

test("listen boost still wins over a 3x day and stays flat", () => {
  const r = pickClaimAmount({ baseAmount: 13938, multiplier: 3, bonusEligible: true, bonusAmount: LISTEN_BONUS_AMOUNT, faucetBalanceTokens: 117_400_000, minFaucetBalanceTokens: LISTEN_MIN_FAUCET_BALANCE });
  assert.deepEqual(r, { amount: 100_000, bonus: true });
  const n = pickClaimAmount({ baseAmount: 13938, multiplier: 3, bonusEligible: false, bonusAmount: LISTEN_BONUS_AMOUNT, faucetBalanceTokens: 117_400_000, minFaucetBalanceTokens: LISTEN_MIN_FAUCET_BALANCE });
  assert.deepEqual(n, { amount: 41814, bonus: false });
});

test("streak counter labels", () => {
  assert.equal(cycleDay(7), 7);
  assert.equal(cycleDay(8), 1);
  assert.equal(cycleDay(14), 7);
  assert.equal(streakBadge({ streak: 6, claimedToday: true, nextStreak: 6 }).label, "Day 6 of 7 — claim tomorrow for 3x");
  const now = streakBadge({ streak: 6, claimedToday: false, nextStreak: 7 });
  assert.equal(now.bonusNow, true);
  assert.equal(now.label, "Day 7: 3x claim! Claim 3x YOUCOG today");
  assert.equal(streakBadge({ streak: 13, claimedToday: false, nextStreak: 14 }).bonusNow, true);
  assert.match(streakBadge({ streak: 7, claimedToday: true, nextStreak: 7 }).label, /^Day 7: 3x claimed today/);
  assert.equal(streakBadge({ streak: 0, claimedToday: false, nextStreak: 1 }).label, "Day 1 of 7 — claim today to start your streak");
  for (const s of [1, 6, 7, 13, 14]) {
    for (const c of [true, false]) {
      const l = streakBadge({ streak: s, claimedToday: c, nextStreak: c ? s : s + 1 }).label;
      assert.doesNotMatch(l, /profit|price|ROI|earn|return|\$/i);
    }
  }
});
