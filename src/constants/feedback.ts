/**
 * In-app feedback survey reward. Change FEEDBACK_REWARD_YOUCOG to resize the
 * reward (e.g. 100_000, 500_000 or 1_000_000); the UI copy and the server
 * payout both read this one constant.
 */
export const FEEDBACK_REWARD_YOUCOG = 1_000_000;

/** Most rewarded surveys per UTC day (env FEEDBACK_DAILY_CAP overrides on the server). */
export const FEEDBACK_DAILY_CAP_DEFAULT = 10;

/** Never pay a survey reward if it would leave the faucet wallet under this many YOUCOG. */
export const FEEDBACK_MIN_FAUCET_BALANCE = 2_000_000;

/** Only people who already claimed from the faucet at least once can earn the reward (anti-farming). */
export const FEEDBACK_REQUIRE_PRIOR_CLAIM = true;
