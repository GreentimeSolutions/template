import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAUCET_CLAIM_FALLBACK_YOUCOG,
  FAUCET_CLAIM_MAX_YOUCOG_DEFAULT,
  FAUCET_CLAIM_MIN_YOUCOG_DEFAULT,
  FAUCET_CLAIM_USD_DEFAULT,
  normalizeClaimAmount,
} from "../../constants/faucet.ts";
import { clampYoucog, computeClaimAmount, computeDailyBudgetYoucog } from "./youcog-price.ts";
import {
  dailyBudgetYoucogFromPrice,
  quoteFaucetClaim,
  resetYoucogPriceCache,
  setYoucogPriceCacheForTests,
} from "./youcog-price.server.ts";

const CFG = {
  targetUsd: 0.02,
  minYoucog: 110_000,
  maxYoucog: 440_000,
  fallbackYoucog: 220_000,
};

test("higher YOUCOG price sends less YOUCOG; lower price sends more", () => {
  const mid = computeClaimAmount({ ...CFG, priceUsd: 0.02 / 220_000 });
  const up = computeClaimAmount({ ...CFG, priceUsd: (0.02 / 220_000) * 2 });
  const down = computeClaimAmount({ ...CFG, priceUsd: (0.02 / 220_000) / 2 });
  assert.equal(mid.amount, 220_000);
  assert.equal(up.amount, 110_000);
  assert.equal(down.amount, 440_000);
  assert.equal(up.amount < mid.amount, true);
  assert.equal(down.amount > mid.amount, true);
  assert.equal(mid.source, "price");
  assert.equal(mid.clamped, false);
});

test("clamps raw quotes to the configured min and max and never returns outside them", () => {
  const tooHighPrice = computeClaimAmount({ ...CFG, priceUsd: 0.02 / 50_000 }); // raw 50k
  const tooLowPrice = computeClaimAmount({ ...CFG, priceUsd: 0.02 / 800_000 }); // raw 800k
  assert.equal(tooHighPrice.rawAmount, 50_000);
  assert.equal(tooHighPrice.amount, 110_000);
  assert.equal(tooHighPrice.clamped, true);
  assert.equal(tooLowPrice.rawAmount, 800_000);
  assert.equal(tooLowPrice.amount, 440_000);
  assert.equal(tooLowPrice.clamped, true);
  assert.equal(clampYoucog(1, 110_000, 440_000), 110_000);
  assert.equal(clampYoucog(999_999, 110_000, 440_000), 440_000);
});

test("missing or invalid prices use the fallback, still clamped", () => {
  for (const priceUsd of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const q = computeClaimAmount({ ...CFG, priceUsd });
    assert.equal(q.usedFallback, true);
    assert.equal(q.source, "fallback");
    assert.equal(q.amount, 220_000);
    assert.ok(q.amount >= CFG.minYoucog && q.amount <= CFG.maxYoucog);
  }
  const clampedFallback = computeClaimAmount({ ...CFG, priceUsd: null, fallbackYoucog: 50 });
  assert.equal(clampedFallback.amount, 110_000);
  assert.equal(clampedFallback.usedFallback, true);
});

test("defaults match the $0.02 target around the Nov 9 2026 price", () => {
  const q = computeClaimAmount({
    priceUsd: 0.00000009292585343,
    targetUsd: FAUCET_CLAIM_USD_DEFAULT,
    minYoucog: FAUCET_CLAIM_MIN_YOUCOG_DEFAULT,
    maxYoucog: FAUCET_CLAIM_MAX_YOUCOG_DEFAULT,
    fallbackYoucog: FAUCET_CLAIM_FALLBACK_YOUCOG,
  });
  assert.equal(q.amount, 215_225);
  assert.equal(q.clamped, false);
});

test("daily USD budget converts with the same price and clamps", () => {
  const price = 0.02 / 220_000;
  const b = computeDailyBudgetYoucog({
    priceUsd: price,
    targetUsd: 0.5,
    minYoucog: 2_500_000,
    maxYoucog: 10_000_000,
    fallbackYoucog: 5_000_000,
  });
  assert.equal(b.amount, 5_500_000);
  assert.equal(dailyBudgetYoucogFromPrice(null), 5_000_000);
  assert.equal(dailyBudgetYoucogFromPrice(price), 5_500_000);
});

test("old client tier numbers are still accepted; junk is not", () => {
  assert.equal(normalizeClaimAmount(840), 840);
  assert.equal(normalizeClaimAmount(2222), 2222);
  assert.equal(normalizeClaimAmount(13938), 13938);
  assert.equal(normalizeClaimAmount(420), 420);
  assert.equal(normalizeClaimAmount(220_000), 220_000);
  assert.equal(normalizeClaimAmount(5), null);
  assert.equal(normalizeClaimAmount(0), null);
});

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } });
}

test("quote uses DexScreener when it has a pair, and ignores the client-visible USD in the result amount math", async () => {
  resetYoucogPriceCache();
  const q = await quoteFaucetClaim({
    nowMs: 1,
    cacheMs: 60_000,
    fetchImpl: async (url) => {
      if (String(url).includes("dexscreener")) {
        return jsonResponse({ pairs: [{ priceUsd: String(0.02 / 200_000), liquidity: { usd: 100 } }] });
      }
      throw new Error("should not hit gecko");
    },
  });
  assert.equal(q.amount, 200_000);
  assert.equal(q.feed, "dexscreener");
  assert.equal(q.usedFallback, false);
});

test("empty DexScreener result falls through to GeckoTerminal", async () => {
  resetYoucogPriceCache();
  const q = await quoteFaucetClaim({
    nowMs: 1,
    cacheMs: 60_000,
    fetchImpl: async (url) => {
      if (String(url).includes("dexscreener")) return jsonResponse({ pairs: [] });
      if (String(url).includes("geckoterminal")) {
        return jsonResponse({ data: { attributes: { price_usd: String(0.02 / 250_000) } } });
      }
      throw new Error(String(url));
    },
  });
  assert.equal(q.amount, 250_000);
  assert.equal(q.feed, "geckoterminal");
});

test("fetch failure uses the last cached price even when stale, otherwise the clamped fallback", async () => {
  resetYoucogPriceCache();
  setYoucogPriceCacheForTests({ priceUsd: 0.02 / 180_000, at: 1, source: "dexscreener" });
  const stale = await quoteFaucetClaim({
    nowMs: 1 + 30 * 60_000,
    cacheMs: 6 * 60_000,
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(stale.amount, 180_000);
  assert.equal(stale.feed, "dexscreener+stale");
  assert.equal(stale.usedFallback, false);

  resetYoucogPriceCache();
  const none = await quoteFaucetClaim({
    nowMs: 1,
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(none.amount, 220_000);
  assert.equal(none.usedFallback, true);
  assert.equal(none.feed, "fallback");
  assert.ok(none.amount >= 110_000 && none.amount <= 440_000);
});
