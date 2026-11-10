/**
 * Daily faucet claim: a USD-pegged YOUCOG amount computed server-side at claim
 * time (FAUCET_CLAIM_USD / current YOUCOG USD price), then clamped. The UI shows
 * a YOUCOG number only — no dollar value is promised.
 *
 * Previous fixed tiers (until 2026-11-09): 840 / 2,222 / 13,938. The 840-YOUCOG
 * gift was the amount paid on 2026-11-07. Daily token budget was 500,000 (and
 * 250,000 before 2026-10-19). Daily claim-count cap default was 100.
 *
 * Fallback 220,000 YOUCOG is about $0.02 at the 2026-11-09 GeckoTerminal price
 * of ~$9.29e-8 (DexScreener did not index the pool). Clamps default to ~0.5x and
 * ~2x that figure.
 */
export const FAUCET_CLAIM_USD_DEFAULT = 0.02;
export const FAUCET_CLAIM_FALLBACK_YOUCOG = 220_000;
export const FAUCET_CLAIM_MIN_YOUCOG_DEFAULT = 110_000;
export const FAUCET_CLAIM_MAX_YOUCOG_DEFAULT = 440_000;
export const FAUCET_PRICE_CACHE_MS_DEFAULT = 6 * 60 * 1000;
/** About 10× the old 500,000 YOUCOG cap at the same 2026-11-09 price (~$0.046). */
export const FAUCET_DAILY_USD_BUDGET_DEFAULT = 0.5;
export const FAUCET_DAILY_TOKEN_BUDGET_DEFAULT = 5_000_000;
export const FAUCET_DAILY_TOKEN_BUDGET_MIN_DEFAULT = 2_500_000;
export const FAUCET_DAILY_TOKEN_BUDGET_MAX_DEFAULT = 10_000_000;
/** 10× the previous default of 100 claims per UTC day. */
export const FAUCET_DAILY_CAP_DEFAULT = 1_000;

/** Display fallback only. The paid amount is computed server-side at claim time. */
export const FAUCET_AMOUNTS = [FAUCET_CLAIM_FALLBACK_YOUCOG] as const;
export type FaucetAmount = number;

/** Older clients still send these; the server accepts them and pays the live quote. */
export const LEGACY_FAUCET_AMOUNTS = [420, 1111, 6969, 840, 2222, 13938] as const;

export const FAUCET_AMOUNTS_LABEL = FAUCET_CLAIM_FALLBACK_YOUCOG.toLocaleString("en-US");

export function isAcceptableClaimRequest(amount: number): boolean {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if ((LEGACY_FAUCET_AMOUNTS as readonly number[]).includes(amount)) return true;
  // Wide enough that a slightly stale UI quote still validates; payout is computed server-side.
  return amount >= Math.floor(FAUCET_CLAIM_MIN_YOUCOG_DEFAULT / 4) && amount <= FAUCET_CLAIM_MAX_YOUCOG_DEFAULT * 2;
}

/** Accepts a request so old and new clients can call the faucet. Does not decide the payout. */
export function normalizeClaimAmount(amount: number): number | null {
  return isAcceptableClaimRequest(amount) ? amount : null;
}

export const FAUCET_PICK_MESSAGE = "Enter a Base address to claim today's YOUCOG gift";
