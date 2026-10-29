/** Mint Club Stake V1.2 on Base (github.com/Steemhunt/mint.club-v2-contract, CertiK staking audits Aug 2025). */
export const MC_STAKE = "0x9Ab05EcA10d087f23a1B22A44A714cdbBA76E802" as const;

/** Read-only demo: an existing same-token pool on Mint Club Staking, used only to show live pool data. Not ours, not endorsed. */
export const DEMO_POOL_ID = 190n;

/** The YOUCOG pool id once Andy creates it; empty until then, so Stake/Unstake/Claim stay switched off. */
export const STAKE_POOL_ID = ((import.meta.env.VITE_YOUCOG_STAKE_POOL_ID as string | undefined) ?? "").trim();

/** Proposed design (not created). Stake YOUCOG, earn YOUCOG from a fixed pool Andy deposits. */
export const PROPOSED_STAKE = {
  stakeSymbol: "YOUCOG",
  rewardSymbol: "YOUCOG",
  durationDays: 90,
  poolSizes: [5_000_000, 10_000_000, 25_000_000],
  defaultPoolSize: 10_000_000,
  /** Example only: total YOUCOG staked by everyone, to show how the share math works. */
  exampleTotalStaked: 40_000_000,
  creationFeeEth: 0.0035,
};
