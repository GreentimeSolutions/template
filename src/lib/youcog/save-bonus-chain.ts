/** Past YOUCOG balances on Base for the save bonus 7-day hold check (no app imports, testable). */
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const ERC20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

/** Base makes a block every 2 seconds. */
const BASE_BLOCK_MS = 2_000;
const PUBLIC_BASE_RPC = "https://mainnet.base.org";

export type Pub = { getBlock: (a: { blockTag: "latest" }) => Promise<{ number: bigint; timestamp: bigint }>; readContract: (a: never) => Promise<unknown> };

/**
 * Past-balance reader: maps a time to the Base block at or before it and reads
 * balanceOf there. Tries the faucet's RPC first, then the public Base RPC
 * (which serves recent historical state). Throws if neither can answer.
 */
export function pastBalanceReader(primary: Pub, token: `0x${string}`) {
  const fallback = createPublicClient({ chain: base, transport: http(PUBLIC_BASE_RPC) }) as unknown as Pub;
  let head: Promise<{ number: bigint; timestamp: bigint }> | null = null;
  const read = (pub: Pub, address: `0x${string}`, blockNumber: bigint) =>
    (pub.readContract as (a: unknown) => Promise<bigint>)({ address: token, abi: ERC20, functionName: "balanceOf", args: [address], blockNumber });
  return async (address: `0x${string}`, atMs: number): Promise<bigint> => {
    head ??= primary.getBlock({ blockTag: "latest" }).catch(() => fallback.getBlock({ blockTag: "latest" }));
    const h = await head;
    const back = BigInt(Math.max(0, Math.ceil((Number(h.timestamp) * 1000 - atMs) / BASE_BLOCK_MS)));
    const blockNumber = h.number - back;
    try {
      return await read(primary, address, blockNumber);
    } catch {
      return await read(fallback, address, blockNumber);
    }
  };
}
