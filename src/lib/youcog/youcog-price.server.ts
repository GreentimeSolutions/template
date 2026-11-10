import {
  FAUCET_CLAIM_FALLBACK_YOUCOG,
  FAUCET_CLAIM_MAX_YOUCOG_DEFAULT,
  FAUCET_CLAIM_MIN_YOUCOG_DEFAULT,
  FAUCET_CLAIM_USD_DEFAULT,
  FAUCET_DAILY_TOKEN_BUDGET_DEFAULT,
  FAUCET_DAILY_TOKEN_BUDGET_MAX_DEFAULT,
  FAUCET_DAILY_TOKEN_BUDGET_MIN_DEFAULT,
  FAUCET_DAILY_USD_BUDGET_DEFAULT,
  FAUCET_PRICE_CACHE_MS_DEFAULT,
} from "../../constants/faucet.ts";
import { computeClaimAmount, computeDailyBudgetYoucog, type ClaimQuote } from "./youcog-price.ts";

export const YOUCOG_TOKEN = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";

type CachedPrice = { priceUsd: number; at: number; source: string };

let cache: CachedPrice | null = null;

export function resetYoucogPriceCache(): void {
  cache = null;
}

export function setYoucogPriceCacheForTests(next: CachedPrice | null): void {
  cache = next;
}

export function lastCachedPrice(): number | null {
  return cache && cache.priceUsd > 0 ? cache.priceUsd : null;
}

function envNum(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function readClaimQuoteConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    targetUsd: envNum(env.FAUCET_CLAIM_USD, FAUCET_CLAIM_USD_DEFAULT),
    minYoucog: envInt(env.FAUCET_CLAIM_MIN_YOUCOG, FAUCET_CLAIM_MIN_YOUCOG_DEFAULT),
    maxYoucog: envInt(env.FAUCET_CLAIM_MAX_YOUCOG, FAUCET_CLAIM_MAX_YOUCOG_DEFAULT),
    fallbackYoucog: envInt(env.FAUCET_CLAIM_FALLBACK_YOUCOG, FAUCET_CLAIM_FALLBACK_YOUCOG),
    cacheMs: envInt(env.FAUCET_PRICE_CACHE_MS, FAUCET_PRICE_CACHE_MS_DEFAULT),
    dailyUsd: envNum(env.FAUCET_DAILY_USD_BUDGET, FAUCET_DAILY_USD_BUDGET_DEFAULT),
    dailyMin: envInt(env.FAUCET_DAILY_TOKEN_BUDGET_MIN, FAUCET_DAILY_TOKEN_BUDGET_MIN_DEFAULT),
    dailyMax: envInt(env.FAUCET_DAILY_TOKEN_BUDGET_MAX, FAUCET_DAILY_TOKEN_BUDGET_MAX_DEFAULT),
    dailyFallback: envInt(env.FAUCET_DAILY_TOKEN_BUDGET, FAUCET_DAILY_TOKEN_BUDGET_DEFAULT),
  };
}

export type PriceFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

async function fromDexScreener(fetchImpl: PriceFetch): Promise<{ priceUsd: number; source: string } | null> {
  const r = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${YOUCOG_TOKEN}`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return null;
  const pairs = ((await r.json()) as { pairs?: { priceUsd?: string; liquidity?: { usd?: number } }[] })?.pairs ?? [];
  let best: { priceUsd: number; liq: number } | null = null;
  for (const p of pairs) {
    const priceUsd = Number(p.priceUsd);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
    const liq = Number(p.liquidity?.usd ?? 0);
    if (!best || liq > best.liq) best = { priceUsd, liq };
  }
  return best ? { priceUsd: best.priceUsd, source: "dexscreener" } : null;
}

async function fromGeckoTerminal(fetchImpl: PriceFetch): Promise<{ priceUsd: number; source: string } | null> {
  const r = await fetchImpl(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${YOUCOG_TOKEN}`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return null;
  const priceUsd = Number((await r.json() as { data?: { attributes?: { price_usd?: string } } })?.data?.attributes?.price_usd);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return { priceUsd, source: "geckoterminal" };
}

export async function fetchYoucogPriceUsd(opts: {
  fetchImpl?: PriceFetch;
  nowMs?: number;
  cacheMs?: number;
} = {}): Promise<{ priceUsd: number; source: string; cacheAgeMs: number } | null> {
  const now = opts.nowMs ?? Date.now();
  const ttl = opts.cacheMs ?? readClaimQuoteConfig().cacheMs;
  if (cache && now - cache.at < ttl) {
    return { priceUsd: cache.priceUsd, source: `${cache.source}+cache`, cacheAgeMs: now - cache.at };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  let got: { priceUsd: number; source: string } | null = null;
  try {
    got = await fromDexScreener(fetchImpl);
  } catch {
    got = null;
  }
  if (!got) {
    try {
      got = await fromGeckoTerminal(fetchImpl);
    } catch {
      got = null;
    }
  }
  if (got) {
    cache = { priceUsd: got.priceUsd, at: now, source: got.source };
    return { priceUsd: got.priceUsd, source: got.source, cacheAgeMs: 0 };
  }
  if (cache) {
    return { priceUsd: cache.priceUsd, source: `${cache.source}+stale`, cacheAgeMs: now - cache.at };
  }
  return null;
}

export type FaucetClaimQuote = ClaimQuote & {
  feed: string;
  cacheAgeMs: number;
  targetUsd: number;
};

export async function quoteFaucetClaim(opts: {
  fetchImpl?: PriceFetch;
  nowMs?: number;
  cacheMs?: number;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<FaucetClaimQuote> {
  const cfg = readClaimQuoteConfig(opts.env);
  const fetched = await fetchYoucogPriceUsd({
    fetchImpl: opts.fetchImpl,
    nowMs: opts.nowMs,
    cacheMs: opts.cacheMs ?? cfg.cacheMs,
  });
  const q = computeClaimAmount({
    priceUsd: fetched?.priceUsd ?? null,
    targetUsd: cfg.targetUsd,
    minYoucog: cfg.minYoucog,
    maxYoucog: cfg.maxYoucog,
    fallbackYoucog: cfg.fallbackYoucog,
  });
  return {
    ...q,
    feed: fetched?.source ?? "fallback",
    cacheAgeMs: fetched?.cacheAgeMs ?? 0,
    targetUsd: cfg.targetUsd,
  };
}

export function dailyBudgetYoucogFromPrice(priceUsd: number | null, env: NodeJS.ProcessEnv = process.env): number {
  const cfg = readClaimQuoteConfig(env);
  if (priceUsd && priceUsd > 0) {
    return computeDailyBudgetYoucog({
      priceUsd,
      targetUsd: cfg.dailyUsd,
      minYoucog: cfg.dailyMin,
      maxYoucog: cfg.dailyMax,
      fallbackYoucog: cfg.dailyFallback,
    }).amount;
  }
  return cfg.dailyFallback;
}
