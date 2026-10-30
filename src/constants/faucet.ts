/**
 * Daily faucet claim tiers (YOUCOG). Doubled on 2026-10-19 (was 420 / 1,111 / 6,969).
 * The streak multiplier (1.25x day 3+, 1.5x day 7+, 3x on every 7th straight day) applies on top. The listen
 * boost (LISTEN_BONUS_AMOUNT) and the feedback reward are separate and unchanged.
 */
export const FAUCET_AMOUNTS = [840, 2222, 13938] as const;
/** Daily YOUCOG paid by the faucet across all claims, boosts included (env FAUCET_DAILY_TOKEN_BUDGET overrides). Was 250,000. */
export const FAUCET_DAILY_TOKEN_BUDGET_DEFAULT = 500_000;

export type FaucetAmount = (typeof FAUCET_AMOUNTS)[number];

/** Pre-doubling tiers, still accepted from older clients and mapped to the doubled tier. */
export const LEGACY_FAUCET_AMOUNTS = [420, 1111, 6969] as const;

export const FAUCET_AMOUNTS_LABEL = FAUCET_AMOUNTS.map((n) => n.toLocaleString("en-US")).join(" / ");

/** Normalize a requested tier: current tiers pass through, legacy tiers are doubled, anything else is null. */
export function normalizeClaimAmount(amount: number): FaucetAmount | null {
  if ((FAUCET_AMOUNTS as readonly number[]).includes(amount)) return amount as FaucetAmount;
  const i = (LEGACY_FAUCET_AMOUNTS as readonly number[]).indexOf(amount);
  return i >= 0 ? FAUCET_AMOUNTS[i] : null;
}

export const FAUCET_PICK_MESSAGE = `Pick ${FAUCET_AMOUNTS.map((n) => n.toLocaleString("en-US")).join(", ").replace(/, ([^,]+)$/, ", or $1")} YOUCOG`;
