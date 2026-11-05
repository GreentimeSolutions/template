/**
 * Forge quests (PREVIEW). 18 quests from the ghost-system plan. Pure logic only.
 * Signals: "real" = read from our faucet DB / Base chain via the read-only /api/quests;
 * "local" = from this device's preview shop inventory; "sim" = no real signal yet, simulated.
 * Claiming a reward only unlocks the item in the local preview inventory (no tx, no DB write).
 */
import { dayOffset } from "./streak-core";

export type Signals = { streak: number; longestStreak: number; totalClaims: number; ycurv: number };
export type Local = { owned: string[]; bought: number; categoriesOwned: number };
export type Source = "real" | "local" | "sim";
/** saves: the server can verify it from real data (faucet claims / verified purchases) and stores the unlock for the wallet. */
export type Quest = { id: string; name: string; reward: string; rewardName: string; source: Source; goal: number; note?: string; saves?: boolean; value: (s: Signals, l: Local) => number };

export const QUESTS: Quest[] = [
  { id: "streak3", saves: true, name: "Claim 3 days in a row", reward: "skin-mint", rewardName: "Mint Sheet", source: "real", goal: 3, value: (s) => s.longestStreak },
  { id: "streak7", saves: true, name: "Claim 7 days in a row", reward: "shades-red", rewardName: "Laser Visor", source: "real", goal: 7, value: (s) => s.longestStreak },
  { id: "streak14", saves: true, name: "Claim 14 days in a row", reward: "skin-lilac", rewardName: "Lilac Sheet", source: "real", goal: 14, value: (s) => s.longestStreak },
  { id: "streak30", saves: true, name: "Claim 30 days in a row", reward: "trail-flame", rewardName: "Flame Trail", source: "real", goal: 30, value: (s) => s.longestStreak },
  { id: "claims10", saves: true, name: "Make 10 claims total", reward: "prop-coffee", rewardName: "Coffee", source: "real", goal: 10, value: (s) => s.totalClaims },
  { id: "ycurv10", name: "Hold 10+ YCURV", reward: "fedora-gold", rewardName: "Gold Fedora", source: "real", goal: 10, note: "Not earnable yet: needs a verified hold check", value: (s) => s.ycurv },
  { id: "ycurvbuy", name: "First YCURV curve buy", reward: "trail-coins", rewardName: "Coin Trail", source: "real", goal: 1, note: "Not earnable yet: needs a verified buy check", value: (s) => (s.ycurv > 0 ? 1 : 0) },
  { id: "bridge", name: "Bridge YOUCOG once (future)", reward: "aura-base", rewardName: "Base Halo", source: "sim", goal: 1, value: () => 0 },
  { id: "medals5", name: "Collect 5 medals", reward: "trail-code", rewardName: "Code Trail", source: "sim", goal: 5, value: () => 0 },
  { id: "medals15", name: "Collect 15 medals", reward: "prop-wand", rewardName: "Magic Wand", source: "sim", goal: 15, value: () => 0 },
  { id: "glitch3", name: "Find 3 glitch ghosts", reward: "skin-glitch", rewardName: "Glitch Sheet", source: "sim", goal: 3, value: () => 0 },
  { id: "buy1", saves: true, name: "Buy first cosmetic", reward: "prop-briefcase", rewardName: "Briefcase", source: "local", goal: 1, note: "Counts verified Ghost Shop purchases", value: (_s, l) => l.bought },
  { id: "allcats", saves: true, name: "Own one item per category", reward: "aura-sparkle", rewardName: "Sparkles", source: "local", goal: 6, value: (_s, l) => l.categoriesOwned },
  { id: "rcst", name: "Recast claim (RCST)", reward: "prop-balloon", rewardName: "Balloon", source: "sim", goal: 1, value: () => 0 },
  { id: "listen5", name: "Listen boost 5 times", reward: "beanie", rewardName: "Beanie", source: "sim", goal: 5, value: () => 0 },
  { id: "play3", name: "Play 3 rounds on /play", reward: "propeller", rewardName: "Propeller Cap", source: "sim", goal: 3, value: () => 0 },
  { id: "mint", name: "Mint your 1/1000 ghost", reward: "prop-laptop", rewardName: "Laptop", source: "sim", goal: 1, value: () => 0 },
  { id: "invite", name: "Invite a friend who claims", reward: "aura-none-blue", rewardName: "Blue Glow", source: "sim", goal: 1, value: () => 0 },
];

export const QUEST_FOR_ITEM: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.reward, q]));

export function progress(q: Quest, s: Signals, l: Local, simDone: string[] = []) {
  const v = q.source === "sim" && simDone.includes(q.id) ? q.goal : Math.max(0, q.value(s, l));
  const have = Math.min(v, q.goal);
  return { have, goal: q.goal, pct: Math.round((have / q.goal) * 100), done: have >= q.goal };
}

/** Longest run of consecutive UTC days in a set of YYYY-MM-DD strings. */
export function longestRun(days: Set<string>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(dayOffset(d, -1))) continue;
    let n = 0, x = d;
    while (days.has(x)) { n++; x = dayOffset(x, 1); }
    best = Math.max(best, n);
  }
  return best;
}
export const EMPTY_SIGNALS: Signals = { streak: 0, longestStreak: 0, totalClaims: 0, ycurv: 0 };

/** Rewards the server may record: only quests with saves=true whose real, server-read signals meet the goal. */
export function earnedRewards(s: Signals, l: Local): string[] {
  const out: string[] = [];
  for (const q of QUESTS) if (q.saves && progress(q, s, l).done) out.push(q.reward);
  return out;
}
/** Quest-only items can never be sold: every quest reward is exclusive to its quest. */
export const QUEST_REWARD_IDS = new Set(QUESTS.map((q) => q.reward));
