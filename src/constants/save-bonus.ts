/**
 * Save bonus (approved by Andy 2026-10-27): keep the YOUCOG you claimed from the
 * faucet for SAVE_BONUS_HOLD_DAYS and you can collect an extra SAVE_BONUS_RATE
 * of that claim, once per claim. Paid from the same daily faucet budget.
 *
 * Off until the env var SAVE_BONUS_SINCE (an ISO time) is set. Only claims made
 * at or after that time qualify, so turning it on never back-pays old claims.
 */
export const SAVE_BONUS_RATE = 0.1;
export const SAVE_BONUS_RATE_LABEL = "10%";
export const SAVE_BONUS_HOLD_DAYS = 7;
/** After it unlocks, a claim's save bonus can be collected for this many days. */
export const SAVE_BONUS_WINDOW_DAYS = 30;
/** At most this many matured claims are settled per tap (bounds one payout). */
export const SAVE_BONUS_MAX_CLAIMS_PER_TAP = 60;
