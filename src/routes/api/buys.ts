import { createFileRoute } from "@tanstack/react-router";
import { PROJECT_WALLETS } from "@/constants/media";

/**
 * Recent real YOUCOG buys from GeckoTerminal (read-only, cached ~60s).
 * Only kind == "buy" with volume_in_usd >= 0.05. The tiny "sells" in the same
 * tx are pool fee swaps and are ignored. Buys by project wallets (agent/faucet,
 * donations) are excluded, so only outside buyers show. Never fabricates data: on failure the
 * list is simply empty.
 */
const POOL = "0x0c6b7aac93aed41f6a12b99e44b821388bd4df31f9247288feef741edb135614";
const TRADES_URL = `https://api.geckoterminal.com/api/v2/networks/base/pools/${POOL}/trades`;
const TTL_MS = 60_000;

export type Buy = { tokens: number; usd: number; from: string; at: string; tx: string };

const EXCLUDED = new Set(PROJECT_WALLETS.map((w) => w.toLowerCase()));

let cache: { at: number; buys: Buy[] } | null = null;

type Trade = {
  attributes?: {
    kind?: string;
    volume_in_usd?: string;
    to_token_amount?: string;
    tx_from_address?: string;
    block_timestamp?: string;
    tx_hash?: string;
  };
};

async function loadBuys(): Promise<Buy[]> {
  const res = await fetch(TRADES_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`trades ${res.status}`);
  const body = (await res.json()) as { data?: Trade[] };
  const buys: Buy[] = [];
  for (const t of body.data ?? []) {
    const a = t.attributes;
    if (!a || a.kind !== "buy") continue;
    const usd = Number(a.volume_in_usd);
    const tokens = Number(a.to_token_amount);
    if (!Number.isFinite(usd) || usd < 0.05 || !Number.isFinite(tokens)) continue;
    if (!a.tx_from_address || !a.block_timestamp) continue;
    if (EXCLUDED.has(a.tx_from_address.toLowerCase())) continue;
    buys.push({ tokens, usd, from: a.tx_from_address, at: a.block_timestamp, tx: a.tx_hash ?? "" });
    if (buys.length >= 10) break;
  }
  return buys;
}

export const Route = createFileRoute("/api/buys")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120" };
        if (cache && Date.now() - cache.at < TTL_MS) return Response.json({ buys: cache.buys }, { headers });
        try {
          const buys = await loadBuys();
          cache = { at: Date.now(), buys };
          return Response.json({ buys }, { headers });
        } catch {
          if (cache) return Response.json({ buys: cache.buys }, { headers });
          return Response.json({ buys: [] }, { headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
