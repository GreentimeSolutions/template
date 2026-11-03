/**
 * Streak flames: cosmetic pixel flame on the streak counter that grows by tier,
 * plus a short tier-unlock moment. Purely visual; reads only the real streak the
 * faucet API returns. No payouts, no claim logic. Behind VITE_STREAK_FLAMES === "1".
 */
export const streakFlamesEnabled = () => import.meta.env.VITE_STREAK_FLAMES === "1";

export const STREAK_LEVELUP = "youcog:streak-levelup";
/** Fired by the Forge cinematic when it closes, so the level-up can chain after it. */
export const FORGE_CLAIM_DONE = "youcog:forge-claim-done";

export type FlameTier = 0 | 1 | 2 | 3 | 4 | 5;
export const TIERS: { tier: FlameTier; min: number; name: string }[] = [
  { tier: 1, min: 1, name: "SPARK" },
  { tier: 2, min: 3, name: "ORANGE FLAME" },
  { tier: 3, min: 7, name: "BLUE FLAME" },
  { tier: 4, min: 14, name: "PURPLE FLAME" },
  { tier: 5, min: 30, name: "RED-HOT GHOST" },
];

export function flameTier(streak: number): FlameTier {
  if (!Number.isSafeInteger(streak) || streak < 1) return 0;
  let t: FlameTier = 0;
  for (const x of TIERS) if (streak >= x.min) t = x.tier;
  return t;
}
export const tierName = (t: FlameTier) => TIERS.find((x) => x.tier === t)?.name ?? "";

export type LevelUp = { kind: "up"; tier: FlameTier; streak: number } | { kind: "reset" };

/** What to show after a confirmed claim, given the streak before and after. Tier 1 (first day) is not a level-up. */
export function streakTransition(prev: number, next: number): LevelUp | null {
  if (!Number.isSafeInteger(next) || next < 1) return null;
  if (next === 1 && prev >= 2) return { kind: "reset" };
  const a = flameTier(prev);
  const b = flameTier(next);
  return b > a && b >= 2 ? { kind: "up", tier: b, streak: next } : null;
}

const KEY = "youcog:last-streak";
export function lastKnownStreak(who: string): number {
  try {
    const v = Number(JSON.parse(localStorage.getItem(KEY) || "{}")[who.toLowerCase()]);
    return Number.isSafeInteger(v) ? v : 0;
  } catch {
    return 0;
  }
}
export function rememberStreak(who: string, streak: number) {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "{}");
    m[who.toLowerCase()] = streak;
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable: cosmetic only */
  }
}

export function streakLevelUp(d: LevelUp) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STREAK_LEVELUP, { detail: d }));
}
