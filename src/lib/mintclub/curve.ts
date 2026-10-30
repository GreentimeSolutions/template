/** Mint Club V2 bonding-curve math, mirrored from MCV2_Bond.sol (getReserveForToken / getRefundForTokens). Pure, no network. */

export const WAD = 10n ** 18n;
export const RATIO_BASE = 10_000n;

export type Step = { rangeTo: bigint; price: bigint }; // both 18-decimal scaled, like the contract

export type CurveDesign = {
  maxSupply: number; // whole tokens
  steps: number;
  startPrice: number; // reserve tokens per curve token
  endPrice: number;
  /** "exponential" spaces prices geometrically; "linear" spaces them evenly. */
  shape: "exponential" | "linear";
};

const toWad = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;

/** Builds strictly increasing step ranges and prices the way Mint Club's create wizard does (equal-width supply steps). */
export function buildSteps(d: CurveDesign): Step[] {
  const out: Step[] = [];
  const max = BigInt(d.maxSupply) * WAD;
  for (let i = 0; i < d.steps; i++) {
    const t = d.steps === 1 ? 0 : i / (d.steps - 1);
    const p = d.shape === "exponential" ? d.startPrice * Math.pow(d.endPrice / d.startPrice, t) : d.startPrice + (d.endPrice - d.startPrice) * t;
    const rangeTo = i === d.steps - 1 ? max : (max * BigInt(i + 1)) / BigInt(d.steps);
    out.push({ rangeTo, price: toWad(p) });
  }
  return out;
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

function currentStep(steps: Step[], supply: bigint): number {
  for (let i = 0; i < steps.length; i++) if (supply <= steps[i].rangeTo) return i;
  return steps.length - 1;
}

/** Cost to buy (mint) `amount` tokens at `supply`: reserve incl. royalty, and the royalty part. */
export function quoteMint(steps: Step[], supply: bigint, amount: bigint, mintRoyaltyBps: number) {
  const max = steps[steps.length - 1].rangeTo;
  if (amount <= 0n || supply + amount > max) return null;
  let cur = supply;
  let left = amount;
  let reserve = 0n;
  for (let i = currentStep(steps, cur); i < steps.length && left > 0n; i++) {
    const room = steps[i].rangeTo - cur;
    if (room === 0n) continue;
    const take = room < left ? room : left;
    reserve += ceilDiv(take * steps[i].price, WAD);
    cur += take;
    left -= take;
  }
  const royalty = (reserve * BigInt(mintRoyaltyBps)) / RATIO_BASE;
  return { total: reserve + royalty, royalty };
}

/** Refund for selling (burning) `amount` tokens at `supply`: refund after royalty, and the royalty part. */
export function quoteBurn(steps: Step[], supply: bigint, amount: bigint, burnRoyaltyBps: number) {
  if (amount <= 0n || amount > supply) return null;
  let cur = supply;
  let left = amount;
  let refund = 0n;
  let i = currentStep(steps, cur);
  while (left > 0n) {
    const inStep = i === 0 ? cur : cur - steps[i - 1].rangeTo;
    const take = left < inStep ? left : inStep;
    refund += (take * steps[i].price) / WAD;
    left -= take;
    cur -= take;
    if (i > 0) i--;
    else if (left > 0n) break;
  }
  const royalty = (refund * BigInt(burnRoyaltyBps)) / RATIO_BASE;
  return { total: refund - royalty, royalty };
}

/** Price of the next token at `supply`. */
export function priceAt(steps: Step[], supply: bigint): bigint {
  return steps[currentStep(steps, supply)].price;
}

/** Reserve locked when the whole curve is minted. */
export function fullCurveReserve(steps: Step[]): bigint {
  let prev = 0n;
  let sum = 0n;
  for (const s of steps) {
    sum += ((s.rangeTo - prev) * s.price) / WAD;
    prev = s.rangeTo;
  }
  return sum;
}

export const fmtUnits = (v: bigint, decimals = 18, maxFrac = 4) => {
  const n = Number(v) / 10 ** decimals;
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : maxFrac });
};
