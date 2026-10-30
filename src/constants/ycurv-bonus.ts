/**
 * YCURV holder bonus (approved by Andy 2026-10-30, defaults below): wallets that hold at least
 * YCURV_BONUS_MIN YCURV (the Mint Club curve token on Base) both right now and
 * YCURV_BONUS_HOLD_HOURS ago get an extra YCURV_BONUS_RATE of their chosen daily
 * tier, capped at YCURV_BONUS_CAP. The extra is added on top of the streak amount
 * (it never multiplies the 1.25x / 1.5x / 3x), and it does not apply when the flat
 * listen boost is paid instead. Paid from the same daily faucet budget.
 *
 * Off unless the server env var YCURV_BONUS_ON is "1".
 */
export const YCURV_BONUS_RATE = 0.25;
export const YCURV_BONUS_RATE_LABEL = "25%";
/** Minimum YCURV held (whole tokens). ~10 YCURV cost ~1,300 YOUCOG on the curve on 2026-10-30. */
export const YCURV_BONUS_MIN = 10;
/** The wallet must also have held the minimum this many hours ago (stops buy-claim-sell). */
export const YCURV_BONUS_HOLD_HOURS = 24;
/** Hard cap on the extra per claim, in YOUCOG. */
export const YCURV_BONUS_CAP = 2_500;
