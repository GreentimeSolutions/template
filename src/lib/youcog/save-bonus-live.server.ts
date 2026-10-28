/** Production wiring for the save bonus: Neon/PGLite, the faucet wallet, and Base reads. */
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { dbSource, getSql } from "@/lib/db";
import { LISTEN_MIN_FAUCET_BALANCE } from "@/constants/listen";
import { FAUCET_MIN_GAS_WEI, TOKEN, clients, dailyTokenBudget, faucetBalances, sendYoucog } from "@/lib/youcog/faucet.server";
import { parseSince } from "@/lib/youcog/save-bonus-core";
import type { SaveBonusDeps } from "@/lib/youcog/save-bonus.server";

const ERC20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

/** Base makes a block every 2 seconds. */
const BASE_BLOCK_MS = 2_000;
const PUBLIC_BASE_RPC = "https://mainnet.base.org";

type Pub = { getBlock: (a: { blockTag: "latest" }) => Promise<{ number: bigint; timestamp: bigint }>; readContract: (a: never) => Promise<unknown> };

/**
 * Past-balance reader: maps a time to the Base block at or before it and reads
 * balanceOf there. Tries the faucet's RPC first, then the public Base RPC
 * (which serves recent historical state). Throws if neither can answer.
 */
function pastBalanceReader(primary: Pub) {
  const fallback = createPublicClient({ chain: base, transport: http(PUBLIC_BASE_RPC) }) as unknown as Pub;
  let head: Promise<{ number: bigint; timestamp: bigint }> | null = null;
  const read = (pub: Pub, address: `0x${string}`, blockNumber: bigint) =>
    (pub.readContract as (a: unknown) => Promise<bigint>)({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [address], blockNumber });
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

/** Null when the faucet can't pay (no key, or no shared database on Vercel). */
export async function liveSaveBonusDeps(): Promise<SaveBonusDeps | null> {
  if (dbSource !== "neon" && process.env.VERCEL) return null;
  const c = clients();
  if (!c) return null;
  const sql = await getSql();
  return {
    sql,
    sinceMs: parseSince(process.env.SAVE_BONUS_SINCE),
    faucetAddress: c.account.address,
    dailyTokenBudget: dailyTokenBudget(),
    minFaucetTokens: LISTEN_MIN_FAUCET_BALANCE,
    minGasWei: FAUCET_MIN_GAS_WEI,
    // Fresh read every time (no cache): the check is "what you hold right now".
    balanceOf: (address) => c.pub.readContract({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [address] }),
    balanceAt: pastBalanceReader(c.pub as unknown as Pub),
    faucetBalances: () => faucetBalances(c),
    send: (to, wei) => sendYoucog(c, to, wei),
  };
}

/** Status only needs the database and the on/off switch. */
export async function liveSaveBonusStatusDeps() {
  return { sql: await getSql(), sinceMs: parseSince(process.env.SAVE_BONUS_SINCE) };
}
