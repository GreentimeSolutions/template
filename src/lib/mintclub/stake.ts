import { createPublicClient, encodeFunctionData, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { MC_STAKE } from "@/constants/stake";
import { withSuffix } from "@/lib/youcog/builder-code";

/** Browser-side reads and tx encoding for Mint Club Stake V1.2 on Base. */
export const stakeAbi = parseAbi([
  "function creationFee() view returns (uint256)",
  "function claimFee() view returns (uint256)",
  "function getPool(uint256 poolId) view returns ((uint256 poolId,(address stakingToken,bool isStakingTokenERC20,address rewardToken,address creator,uint104 rewardAmount,uint32 rewardDuration,uint40 rewardStartsAt,uint40 rewardStartedAt,uint40 cancelledAt,uint128 totalStaked,uint32 activeStakerCount,uint40 lastRewardUpdatedAt,uint256 accRewardPerShare,uint104 totalAllocatedRewards) pool,(string symbol,string name,uint8 decimals) stakingToken,(string symbol,string name,uint8 decimals) rewardToken))",
  "function userPoolStake(address user, uint256 poolId) view returns (uint104 stakedAmount, uint104 claimedTotal, uint104 feeTotal, uint256 rewardDebt)",
  "function claimableReward(uint256 poolId, address staker) view returns (uint256 rewardClaimable, uint256 fee, uint256 claimedTotal, uint256 feeTotal)",
  "function stake(uint256 poolId, uint104 amount)",
  "function unstake(uint256 poolId, uint104 amount)",
  "function claim(uint256 poolId)",
]);
const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

export type PoolInfo = {
  id: bigint;
  stakingToken: Address;
  stakeSymbol: string;
  rewardSymbol: string;
  stakeDecimals: number;
  rewardDecimals: number;
  rewardAmount: bigint;
  durationSec: number;
  startedAt: number; // 0 = not started (starts on first stake)
  cancelledAt: number;
  totalStaked: bigint;
  stakers: number;
  allocated: bigint;
  creationFee: bigint;
  claimFeeBps: number;
};

export async function readPool(id: bigint): Promise<PoolInfo> {
  const [v, creationFee, claimFee] = await Promise.all([
    client.readContract({ address: MC_STAKE, abi: stakeAbi, functionName: "getPool", args: [id] }),
    client.readContract({ address: MC_STAKE, abi: stakeAbi, functionName: "creationFee" }),
    client.readContract({ address: MC_STAKE, abi: stakeAbi, functionName: "claimFee" }),
  ]);
  return {
    id,
    stakingToken: v.pool.stakingToken,
    stakeSymbol: v.stakingToken.symbol,
    rewardSymbol: v.rewardToken.symbol,
    stakeDecimals: v.stakingToken.decimals,
    rewardDecimals: v.rewardToken.decimals,
    rewardAmount: v.pool.rewardAmount,
    durationSec: v.pool.rewardDuration,
    startedAt: v.pool.rewardStartedAt,
    cancelledAt: v.pool.cancelledAt,
    totalStaked: v.pool.totalStaked,
    stakers: v.pool.activeStakerCount,
    allocated: v.pool.totalAllocatedRewards,
    creationFee,
    claimFeeBps: Number(claimFee),
  };
}

type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

async function send(p: Provider, from: Address, to: Address, data: `0x${string}`) {
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to, data: withSuffix(data), chainId: "0x2105" }] })) as `0x${string}`;
  await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

/** Stake from the Farcaster wallet: approve the exact amount, then stake. Only reachable when a real pool id is configured. */
export async function stakeInPool(p: Provider, from: Address, pool: PoolInfo, amount: bigint) {
  const have = await client.readContract({ address: pool.stakingToken, abi: erc20Abi, functionName: "allowance", args: [from, MC_STAKE] });
  if (have < amount) await send(p, from, pool.stakingToken, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [MC_STAKE, amount] }));
  return send(p, from, MC_STAKE, encodeFunctionData({ abi: stakeAbi, functionName: "stake", args: [pool.id, amount] }));
}
/** Unstake (also pays out any earned rewards, minus Mint Club's claim fee). */
export async function unstakeFromPool(p: Provider, from: Address, pool: PoolInfo, amount: bigint) {
  return send(p, from, MC_STAKE, encodeFunctionData({ abi: stakeAbi, functionName: "unstake", args: [pool.id, amount] }));
}
export async function claimFromPool(p: Provider, from: Address, pool: PoolInfo) {
  return send(p, from, MC_STAKE, encodeFunctionData({ abi: stakeAbi, functionName: "claim", args: [pool.id] }));
}
