/** Server-side YCURV hold check for the faucet holder bonus (reads Base; fails closed). */
import { parseAbi, parseUnits } from "viem";
import { YCURV } from "@/constants/curve";
import { YCURV_BONUS_HOLD_HOURS, YCURV_BONUS_MIN } from "@/constants/ycurv-bonus";
import { pastBalanceReader, type Pub } from "@/lib/youcog/save-bonus-chain";
import { holdsYcurv } from "@/lib/youcog/ycurv-bonus-core";

const ERC20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

export function ycurvBonusOn(): boolean {
  return process.env.YCURV_BONUS_ON?.trim() === "1";
}

type Reader = { readContract: (a: never) => Promise<unknown>; getBlock: Pub["getBlock"] };

/** True when `address` held >= YCURV_BONUS_MIN YCURV now and YCURV_BONUS_HOLD_HOURS ago. Any RPC error = false. */
export async function isYcurvHolder(pub: Reader, address: `0x${string}`): Promise<boolean> {
  if (!ycurvBonusOn()) return false;
  try {
    const minWei = parseUnits(String(YCURV_BONUS_MIN), 18);
    const past = pastBalanceReader(pub as unknown as Pub, YCURV.address);
    const [now, then] = await Promise.all([
      (pub.readContract as (a: unknown) => Promise<bigint>)({ address: YCURV.address, abi: ERC20, functionName: "balanceOf", args: [address] }),
      past(address, Date.now() - YCURV_BONUS_HOLD_HOURS * 3600_000),
    ]);
    return holdsYcurv(now, then, minWei);
  } catch {
    return false;
  }
}
