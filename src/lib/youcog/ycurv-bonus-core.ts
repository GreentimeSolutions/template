/** Pure YCURV holder bonus rules (no I/O), shared by the server and unit tests. */
import { YCURV_BONUS_CAP, YCURV_BONUS_RATE } from "../../constants/ycurv-bonus";

/** Extra YOUCOG for a holder on the chosen tier: RATE of the tier, rounded down, capped. */
export function ycurvBonusExtra(tier: number, rate = YCURV_BONUS_RATE, cap = YCURV_BONUS_CAP): number {
  if (!Number.isFinite(tier) || tier <= 0 || rate <= 0) return 0;
  return Math.min(cap, Math.floor(tier * rate));
}

/** Holds the minimum both now and at the look-back time (the lower of the two counts). */
export function holdsYcurv(balanceNowWei: bigint, balancePastWei: bigint, minWei: bigint): boolean {
  const held = balanceNowWei < balancePastWei ? balanceNowWei : balancePastWei;
  return minWei > 0n && held >= minWei;
}
