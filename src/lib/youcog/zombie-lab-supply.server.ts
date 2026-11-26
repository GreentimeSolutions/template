/**
 * Live Zombie Lab card supply on Base mainnet. Cached briefly.
 * Read-only; never sends a transaction.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { ZOMBIE_LAB_CONTRACT } from "@/constants/zombie-lab";
import type { ZombieLabSupplyJson } from "./zombie-lab-supply";

const abi = parseAbi([
  "function availableToMint() view returns (uint256)",
  "function totalCap() view returns (uint256)",
]);

const CACHE_MS = 30_000;

export type ZombieLabSupply = ZombieLabSupplyJson;

let cache: { at: number; data: ZombieLabSupply } | null = null;

export function clearZombieLabSupplyCache() {
  cache = null;
}

export async function readZombieLabSupply(): Promise<ZombieLabSupply> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  const rpc = process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
  const client = createPublicClient({ chain: base, transport: http(rpc) });
  const address = ZOMBIE_LAB_CONTRACT as Address;
  const [leftRaw, maxRaw] = await Promise.all([
    client.readContract({ address, abi, functionName: "availableToMint" }),
    client.readContract({ address, abi, functionName: "totalCap" }),
  ]);
  const left = Number(leftRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(left) || !Number.isFinite(max) || max <= 0 || left < 0 || left > max) {
    throw new Error("Unexpected Zombie Lab supply values");
  }
  if (!Number.isInteger(left) || !Number.isInteger(max)) {
    throw new Error("Unexpected Zombie Lab supply values");
  }
  const data: ZombieLabSupply = { left, max };
  cache = { at: now, data };
  return data;
}
