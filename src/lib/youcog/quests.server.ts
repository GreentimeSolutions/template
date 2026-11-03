/** READ-ONLY quest signals: faucet claim history from our DB plus YCURV balance on Base. No writes, no txs. */
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseAbi } from "viem";
import { base } from "viem/chains";
import { getSql } from "@/lib/db";
import { claimDays } from "@/lib/youcog/faucet.server";
import { dayOffset, runEndingAt } from "@/lib/youcog/streak-core";
import { CURVE_TOKEN } from "@/constants/curve";
import { longestRun, type Signals } from "@/lib/youcog/quests-core";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]);

async function ycurvOf(address?: `0x${string}`): Promise<number> {
  if (!address) return 0;
  const pub = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org") });
  const [bal, dec] = await Promise.all([
    pub.readContract({ address: CURVE_TOKEN, abi: erc20, functionName: "balanceOf", args: [address] }),
    pub.readContract({ address: CURVE_TOKEN, abi: erc20, functionName: "decimals" }),
  ]);
  return Number(formatUnits(bal, dec));
}

export async function questSignals(who: { fid?: number; address?: string }): Promise<Signals> {
  const address = who.address && isAddress(who.address, { strict: false }) ? getAddress(who.address) : undefined;
  if (!who.fid && !address) return { streak: 0, longestStreak: 0, totalClaims: 0, ycurv: 0 };
  const sql = await getSql();
  const days = await claimDays(sql, { fid: who.fid, address });
  const today = new Date().toISOString().slice(0, 10);
  const streak = days.has(today) ? runEndingAt(days, today) : runEndingAt(days, dayOffset(today, -1));
  const ycurv = await ycurvOf(address).catch(() => 0);
  return { streak, longestStreak: longestRun(days), totalClaims: days.size, ycurv };
}
