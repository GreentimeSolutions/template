/** Pure YOUCOG price → claim amount rules (no I/O). */

export type ClaimQuoteInput = {
  priceUsd?: number | null;
  targetUsd: number;
  minYoucog: number;
  maxYoucog: number;
  fallbackYoucog: number;
};

export type ClaimQuote = {
  amount: number;
  priceUsd: number | null;
  rawAmount: number | null;
  usedFallback: boolean;
  clamped: boolean;
  source: "price" | "fallback";
};

export function clampYoucog(amount: number, min: number, max: number): number {
  if (!Number.isFinite(amount)) amount = min;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, Math.round(amount)));
}

export function computeClaimAmount(input: ClaimQuoteInput): ClaimQuote {
  const { targetUsd, minYoucog, maxYoucog, fallbackYoucog } = input;
  const price = input.priceUsd;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    const amount = clampYoucog(fallbackYoucog, minYoucog, maxYoucog);
    return {
      amount,
      priceUsd: null,
      rawAmount: null,
      usedFallback: true,
      clamped: amount !== Math.round(fallbackYoucog),
      source: "fallback",
    };
  }
  const raw = targetUsd / price;
  if (!Number.isFinite(raw) || raw <= 0) {
    const amount = clampYoucog(fallbackYoucog, minYoucog, maxYoucog);
    return { amount, priceUsd: price, rawAmount: null, usedFallback: true, clamped: true, source: "fallback" };
  }
  const rounded = Math.round(raw);
  const amount = clampYoucog(rounded, minYoucog, maxYoucog);
  return {
    amount,
    priceUsd: price,
    rawAmount: rounded,
    usedFallback: false,
    clamped: amount !== rounded,
    source: "price",
  };
}

export function computeDailyBudgetYoucog(input: ClaimQuoteInput): ClaimQuote {
  return computeClaimAmount(input);
}
