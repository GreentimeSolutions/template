import type { CurveDesign } from "@/lib/mintclub/curve";

/** Mint Club V2 MCV2_Bond on Base (github.com/Steemhunt/mint.club-v2-contract). */
export const MC_BOND = "0xc5a076cad94176c2996B32d8466Be1cE757FAa27" as const;
export const YOUCOG = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3" as const;
export const MT = "0xFf45161474C39cB00699070Dd49582e417b57a7E" as const;

/** Read-only demo: an existing MT-backed Mint Club token on Base, used only to show live quotes. Not ours, not endorsed. */
export const DEMO_TOKEN = { address: "0x5eac6641C0D92270355eB59101Ced3492872CD9d" as const, symbol: "LEAF" };

/**
 * The curve token Youcognito would create. Empty until Andy approves creating it;
 * while empty, buy/sell stays switched off and the page shows example data.
 */
export const CURVE_TOKEN = ((import.meta.env.VITE_YOUCOG_CURVE_TOKEN as string | undefined) ?? "").trim() as `0x${string}` | "";

/** Proposed design (not created). YOUCOG-backed, 1M max supply, 20 exponential steps, 1% royalty each way. */
export const PROPOSED = {
  name: "Incognito",
  symbol: "INCOG",
  reserveSymbol: "YOUCOG",
  royaltyBps: 100,
  design: { maxSupply: 1_000_000, steps: 20, startPrice: 100, endPrice: 10_000, shape: "exponential" } satisfies CurveDesign,
  /** Example state for the preview chart and quotes: this many tokens "already bought". Example data only. */
  exampleSupply: 140_000,
  creationFeeEth: 0.0007,
};

export const SLIPPAGE_BPS = 200n; // 2% guard on maxReserve / minRefund
