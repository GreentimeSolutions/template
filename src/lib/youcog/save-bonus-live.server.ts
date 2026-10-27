/** Production wiring for the save bonus: Neon/PGLite, the faucet wallet, and Base reads. */
import { parseAbi } from "viem";
import { dbSource, getSql } from "@/lib/db";
import { LISTEN_MIN_FAUCET_BALANCE } from "@/constants/listen";
import { FAUCET_MIN_GAS_WEI, TOKEN, clients, dailyTokenBudget, faucetBalances, sendYoucog } from "@/lib/youcog/faucet.server";
import { parseSince } from "@/lib/youcog/save-bonus-core";
import type { SaveBonusDeps } from "@/lib/youcog/save-bonus.server";

const ERC20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

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
    faucetBalances: () => faucetBalances(c),
    send: (to, wei) => sendYoucog(c, to, wei),
  };
}

/** Status only needs the database and the on/off switch. */
export async function liveSaveBonusStatusDeps() {
  return { sql: await getSql(), sinceMs: parseSince(process.env.SAVE_BONUS_SINCE) };
}
