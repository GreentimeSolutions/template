/** Mint Club V2 MCV2_Bond on Base (github.com/Steemhunt/mint.club-v2-contract). */
export const MC_BOND = "0xc5a076cad94176c2996B32d8466Be1cE757FAa27" as const;
export const YOUCOG = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3" as const;

/**
 * Youcog Curve (YCURV): the Mint Club curve token Andy created on Base, backed by YOUCOG.
 * Created with 1M max supply, 20 exponential steps from 100 to 10,000 YOUCOG, 1% royalty each way.
 * The page reads all steps, supply, price and royalties live from the Bond contract; nothing here is hardcoded beyond the address.
 */
export const YCURV = {
  address: "0xB62C395519f0D51A637a5cc73C1819b71BfB6984" as const,
  name: "Youcog Curve",
  symbol: "YCURV",
};

/** Optional override via VITE_YOUCOG_CURVE_TOKEN; defaults to YCURV. */
const envToken = ((import.meta.env.VITE_YOUCOG_CURVE_TOKEN as string | undefined) ?? "").trim();
export const CURVE_TOKEN = (envToken || YCURV.address) as `0x${string}`;

export const SLIPPAGE_BPS = 200n; // 2% guard on maxReserve / minRefund
