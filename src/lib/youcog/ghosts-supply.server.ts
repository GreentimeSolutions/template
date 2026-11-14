/**
 * Live Ghosts supply on Base mainnet. Cached briefly.
 * Read-only; never sends a transaction.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { GHOSTS_CONTRACT } from "@/constants/ghosts";
import { freeLeft, mintsLeft, type GhostsSupplyJson } from "./ghost-lab-core";

const abi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function freeUntil() view returns (uint256)",
  "function currentPrice() view returns (uint256)",
]);

const CACHE_MS = 30_000;

export type GhostsSupply = GhostsSupplyJson;

let cache: { at: number; data: GhostsSupply } | null = null;

export function clearGhostsSupplyCache() {
  cache = null;
}

export async function readGhostsSupply(): Promise<GhostsSupply> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  const rpc = process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
  const client = createPublicClient({ chain: base, transport: http(rpc) });
  const address = GHOSTS_CONTRACT as Address;
  const [ts, max, fu, price] = await Promise.all([
    client.readContract({ address, abi, functionName: "totalSupply" }),
    client.readContract({ address, abi, functionName: "MAX_SUPPLY" }),
    client.readContract({ address, abi, functionName: "freeUntil" }),
    client.readContract({ address, abi, functionName: "currentPrice" }),
  ]);
  const minted = Number(ts);
  const maxN = Number(max);
  const freeUntilN = Number(fu);
  if (!Number.isFinite(minted) || !Number.isFinite(maxN) || maxN <= 0 || !Number.isFinite(freeUntilN) || freeUntilN < 0) {
    throw new Error("Unexpected Ghosts supply values");
  }
  const data: GhostsSupply = {
    minted,
    max: maxN,
    left: mintsLeft(maxN, minted),
    freeUntil: freeUntilN,
    freeLeft: freeLeft(freeUntilN, minted),
    priceWei: (price as bigint).toString(),
  };
  cache = { at: now, data };
  return data;
}
