/**
 * Anonymous YOUCOG tips: paid from the sender's earned faucet claims via the
 * app wallet, then announced in /recast without naming the sender.
 *
 * Off (dry-run) unless TIPS_LIVE=1. Gift point rewards, if any, are announced
 * separately — nothing here promises value or a payout schedule.
 *
 * Default sizes are 1× / 2× / 5× the faucet fallback claim (env TIPS_MIN,
 * TIPS_MAX, TIPS_DAILY_AMOUNT_CAP override). Live config uses the current
 * USD-pegged claim amount when available.
 */
import { FAUCET_CLAIM_FALLBACK_YOUCOG } from "./faucet.ts";

export const TIP_CLAIM_MULTIPLIERS = [1, 2, 5] as const;
export const TIP_MIN = FAUCET_CLAIM_FALLBACK_YOUCOG;
export const TIP_MAX = FAUCET_CLAIM_FALLBACK_YOUCOG * 5;
export const TIP_SUGGESTED = TIP_CLAIM_MULTIPLIERS.map((m) => FAUCET_CLAIM_FALLBACK_YOUCOG * m);
/** Default: 1 gift point per 100 YOUCOG tipped. Override with GIFT_POINTS_PER_100. */
export const GIFT_POINTS_PER_100_DEFAULT = 1;
export const TIP_DAILY_COUNT_CAP_DEFAULT = 5;
export const TIP_DAILY_AMOUNT_CAP_DEFAULT = FAUCET_CLAIM_FALLBACK_YOUCOG * 10;
export const TIP_TOKEN = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3" as const;
export const TIP_CHANNEL = "recast";
