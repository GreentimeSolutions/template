/**
 * Live Ghosts supply on Base mainnet (totalSupply + MAX_SUPPLY). Cached briefly.
 * Read-only; never sends a transaction.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { GHOSTS_CONTRACT } from "@/constants/ghosts";
import { mintsLeft } from "./ghost-lab-core";

const abi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
]);

const CACHE_MS = 30_000;

export type GhostsSupply = { minted: number; max: number; left: number };

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
  const [ts, max] = await Promise.all([
    client.readContract({ address, abi, functionName: "totalSupply" }),
    client.readContract({ address, abi, functionName: "MAX_SUPPLY" }),
  ]);
  const minted = Number(ts);
  const maxN = Number(max);
  if (!Number.isFinite(minted) || !Number.isFinite(maxN) || maxN <= 0) {
    throw new Error("Unexpected Ghosts supply values");
  }
  const data: GhostsSupply = { minted, max: maxN, left: mintsLeft(maxN, minted) };
  cache = { at: now, data };
  return data;
}
