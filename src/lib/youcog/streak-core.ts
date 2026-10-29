/**
 * Pure faucet streak rules (no I/O), shared by the server, the faucet card and unit tests.
 *
 * - A streak is consecutive UTC days with a sent claim; missing a day resets it to 1.
 * - Day 3+ pays 1.25x, day 7+ pays 1.5x the chosen tier.
 * - Every 7th straight day (7, 14, 21, ...) pays 3x the chosen tier instead
 *   (approved by Andy 2026-10-29). The 3x replaces that day's 1.5x; it does not stack.
 */

/** Every Nth consecutive day is a 3x day. */
export const STREAK_BONUS_EVERY = 7;
/** Multiplier on the chosen tier on a 3x day. */
export const STREAK_BONUS_MULTIPLIER = 3;

/** True on day 7, 14, 21, ... of a streak. */
export function isStreakBonusDay(streak: number): boolean {
  return Number.isSafeInteger(streak) && streak > 0 && streak % STREAK_BONUS_EVERY === 0;
}

/** Multiplier for the claim that makes the streak `streak` days long. */
export function streakMultiplier(streak: number): number {
  if (isStreakBonusDay(streak)) return STREAK_BONUS_MULTIPLIER;
  return streak >= 7 ? 1.5 : streak >= 3 ? 1.25 : 1;
}

/** The multiplier a streak would have without the 3x day (used as the fallback amount). */
export function regularMultiplier(streak: number): number {
  return streak >= 7 ? 1.5 : streak >= 3 ? 1.25 : 1;
}

export function dayOffset(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive claim days ending at `endDay` (inclusive), from a set of distinct YYYY-MM-DD days. */
export function runEndingAt(days: Set<string>, endDay: string): number {
  let n = 0;
  let d = endDay;
  while (days.has(d)) {
    n++;
    d = dayOffset(d, -1);
  }
  return n;
}

/** Streak a claim made on `today` would have, given prior sent-claim days (today itself is ignored). */
export function claimStreak(days: Set<string>, today: string): number {
  return runEndingAt(days, dayOffset(today, -1)) + 1;
}

/** Position 1..7 inside the current 7-day cycle for a streak (0 for no streak). */
export function cycleDay(streak: number): number {
  return streak > 0 ? ((streak - 1) % STREAK_BONUS_EVERY) + 1 : 0;
}

export type StreakState = { streak: number; claimedToday: boolean; nextStreak: number };

/** Faucet card label for the streak counter. Compliant wording: just "claim 3x YOUCOG". */
export function streakBadge(s: StreakState): { day: number; label: string; bonusNow: boolean } {
  if (!s.claimedToday) {
    const day = cycleDay(s.nextStreak);
    if (isStreakBonusDay(s.nextStreak)) return { day, label: `Day ${s.nextStreak}: 3x claim! Claim 3x YOUCOG today`, bonusNow: true };
    if (day === STREAK_BONUS_EVERY - 1) return { day, label: `Day ${day} of ${STREAK_BONUS_EVERY} — claim today, then tomorrow is 3x`, bonusNow: false };
    return { day, label: `Day ${day} of ${STREAK_BONUS_EVERY} — claim today to ${s.nextStreak === 1 ? "start" : "keep"} your streak`, bonusNow: false };
  }
  const day = cycleDay(s.streak);
  if (day === STREAK_BONUS_EVERY) return { day, label: `Day ${s.streak}: 3x claimed today. Next 3x in ${STREAK_BONUS_EVERY} days`, bonusNow: false };
  if (day === STREAK_BONUS_EVERY - 1) return { day, label: `Day ${day} of ${STREAK_BONUS_EVERY} — claim tomorrow for 3x`, bonusNow: false };
  const left = STREAK_BONUS_EVERY - day;
  return { day, label: `Day ${day} of ${STREAK_BONUS_EVERY} — ${left} more days to a 3x claim`, bonusNow: false };
}
