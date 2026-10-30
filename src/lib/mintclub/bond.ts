import { createPublicClient, encodeFunctionData, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { MC_BOND, SLIPPAGE_BPS } from "@/constants/curve";
import type { Step } from "./curve";
import { withSuffix } from "@/lib/youcog/builder-code";

/** Browser-side reads and tx encoding for Mint Club V2 on Base (same contract calls the mint.club-v2-sdk makes). */
export const bondAbi = parseAbi([
  "function getReserveForToken(address token, uint256 tokensToMint) view returns (uint256 reserveAmount, uint256 royalty)",
  "function getRefundForTokens(address token, uint256 tokensToBurn) view returns (uint256 refundAmount, uint256 royalty)",
  "function getSteps(address token) view returns ((uint128 rangeTo, uint128 price)[])",
  "function tokenBond(address token) view returns (address creator, uint16 mintRoyalty, uint16 burnRoyalty, uint40 createdAt, address reserveToken, uint256 reserveBalance)",
  "function mint(address token, uint256 tokensToMint, uint256 maxReserveAmount, address receiver) returns (uint256)",
  "function burn(address token, uint256 tokensToBurn, uint256 minRefund, address receiver) returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

export type BondState = {
  name: string;
  symbol: string;
  steps: Step[];
  supply: bigint;
  mintRoyaltyBps: number;
  burnRoyaltyBps: number;
  reserveToken: Address;
  reserveSymbol: string;
  reserveBalance: bigint;
};

export async function readBond(token: Address): Promise<BondState> {
  const [steps, bond, supply, name, symbol] = await Promise.all([
    client.readContract({ address: MC_BOND, abi: bondAbi, functionName: "getSteps", args: [token] }),
    client.readContract({ address: MC_BOND, abi: bondAbi, functionName: "tokenBond", args: [token] }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  ]);
  const [, mintRoyalty, burnRoyalty, , reserveToken, reserveBalance] = bond;
  const reserveSymbol = await client.readContract({ address: reserveToken, abi: erc20Abi, functionName: "symbol" });
  return {
    name,
    symbol,
    steps: steps.map((s) => ({ rangeTo: s.rangeTo, price: s.price })),
    supply,
    mintRoyaltyBps: mintRoyalty,
    burnRoyaltyBps: burnRoyalty,
    reserveToken,
    reserveSymbol,
    reserveBalance,
  };
}

export async function quoteBuyOnChain(token: Address, amount: bigint) {
  const [total, royalty] = await client.readContract({ address: MC_BOND, abi: bondAbi, functionName: "getReserveForToken", args: [token, amount] });
  return { total, royalty };
}
export async function quoteSellOnChain(token: Address, amount: bigint) {
  const [total, royalty] = await client.readContract({ address: MC_BOND, abi: bondAbi, functionName: "getRefundForTokens", args: [token, amount] });
  return { total, royalty };
}

type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

async function waitFor(hash: `0x${string}`) {
  await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
}
async function send(p: Provider, from: Address, to: Address, data: `0x${string}`) {
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to, data: withSuffix(data), chainId: "0x2105" }] })) as `0x${string}`;
  await waitFor(hash);
  return hash;
}
async function ensureAllowance(p: Provider, from: Address, erc20: Address, amount: bigint) {
  const have = await client.readContract({ address: erc20, abi: erc20Abi, functionName: "allowance", args: [from, MC_BOND] });
  if (have >= amount) return;
  await send(p, from, erc20, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [MC_BOND, amount] }));
}

/**
 * Buy (mint) on the curve from the Farcaster wallet: approve the exact reserve amount, then mint with a 2% max-cost guard.
 * Only called when a real curve token is configured and the user taps Buy; the wallet asks the user to confirm each step.
 */
export async function buyOnCurve(p: Provider, from: Address, token: Address, reserveToken: Address, amount: bigint) {
  const q = await quoteBuyOnChain(token, amount);
  const max = q.total + (q.total * SLIPPAGE_BPS) / 10_000n;
  await ensureAllowance(p, from, reserveToken, max);
  return send(p, from, MC_BOND, encodeFunctionData({ abi: bondAbi, functionName: "mint", args: [token, amount, max, from] }));
}

/** Sell (burn) back to the curve: approve the curve token to the Bond, then burn with a 2% min-refund guard. */
export async function sellOnCurve(p: Provider, from: Address, token: Address, amount: bigint) {
  const q = await quoteSellOnChain(token, amount);
  const min = q.total - (q.total * SLIPPAGE_BPS) / 10_000n;
  await ensureAllowance(p, from, token, amount);
  return send(p, from, MC_BOND, encodeFunctionData({ abi: bondAbi, functionName: "burn", args: [token, amount, min, from] }));
}

export async function balanceOf(token: Address, who: Address) {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
}
