import { STREAK_BONUS_EVERY, streakBadge } from "@/lib/youcog/streak-core";
import { flameTier, lastKnownStreak, streakFlamesEnabled, tierName } from "@/lib/youcog/streak-flames";
import { StreakFlame } from "@/components/youcog/streak-flames";

export type StreakCounterState = { streak: number; claimedToday: boolean; nextStreak: number };

/** "Day 6 of 7" counter with seven pips; the 7th pip is the 3x day. */
export function StreakCounter({ streak, flameKey }: { streak: StreakCounterState; flameKey: string }) {
  const badge = streakBadge(streak);
  const flames = streakFlamesEnabled();
  const tier = flameTier(streak.streak);
  const wasReset = flames && streak.streak === 0 && !streak.claimedToday && lastKnownStreak(flameKey) >= 2;
  return (
    <div
      data-testid="streak"
      className={`mt-2 rounded-seal border px-3 py-2 ${badge.bonusNow ? "border-accent bg-accent/10" : "border-line"}`}
    >
      {flames ? (
        <div className="flex items-center gap-2">
          {tier ? <StreakFlame streak={streak.streak} tier={tier} size={40} /> : null}
          <p className="text-sm text-ink">
            {wasReset ? "Streak reset. Start a new flame today." : `${streak.streak}-day streak`}
            {streak.claimedToday ? " · claimed today" : ""}
            {tier ? <span className="block text-[10px] tracking-widest text-mist">{tierName(tier)}</span> : null}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink">
          🔥 {streak.streak}-day streak{streak.claimedToday ? " · claimed today" : ""}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: STREAK_BONUS_EVERY }, (_, i) => {
          const filled = i < (streak.claimedToday ? badge.day : badge.day - 1);
          const isToday = !streak.claimedToday && i === badge.day - 1;
          const last = i === STREAK_BONUS_EVERY - 1;
          return (
            <span
              key={i}
              className={`flex h-6 flex-1 items-center justify-center rounded-full text-[10px] font-semibold ${
                filled ? "bg-accent text-accent-fg" : isToday ? "border border-accent text-ink" : "border border-line text-faint"
              }`}
            >
              {last ? "3x" : i + 1}
            </span>
          );
        })}
      </div>
      <p data-testid="streak-label" className={`mt-1.5 text-xs ${badge.bonusNow ? "font-semibold text-ink" : "text-mist"}`}>
        {badge.label}
      </p>
    </div>
  );
}
