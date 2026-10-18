/**
 * Pure rules for the listen bonus (no I/O), shared by the server and unit tests.
 */

export type FinishCheck = { ok: true } | { ok: false; reason: string };

/** Server-side guard: wall-clock time since start must cover the song (minus tolerance) and not be stale. */
export function checkFinish(input: {
  startedAtMs: number;
  nowMs: number;
  songSeconds: number;
  toleranceSeconds: number;
  graceSeconds: number;
}): FinishCheck {
  const elapsed = (input.nowMs - input.startedAtMs) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) return { ok: false, reason: "That listen session isn't valid." };
  if (elapsed < input.songSeconds - input.toleranceSeconds) {
    return { ok: false, reason: "The song isn't over yet. Listen all the way to the end." };
  }
  if (elapsed > input.songSeconds + input.graceSeconds) {
    return { ok: false, reason: "That listen session expired. Start the song again." };
  }
  return { ok: true };
}

/** Decide the claim amount server-side. Never uses a client-sent total. */
export function pickClaimAmount(input: {
  baseAmount: number;
  multiplier: number;
  bonusEligible: boolean;
  bonusAmount: number;
  faucetBalanceTokens: number;
  minFaucetBalanceTokens: number;
}): { amount: number; bonus: boolean } {
  const normal = Math.round(input.baseAmount * input.multiplier);
  if (
    input.bonusEligible &&
    input.bonusAmount > normal &&
    input.faucetBalanceTokens - input.bonusAmount >= input.minFaucetBalanceTokens
  ) {
    return { amount: input.bonusAmount, bonus: true };
  }
  return { amount: normal, bonus: false };
}

/** Identity key, matching what the faucet keys claims on. */
export function listenIdentity(who: { fid?: number; address?: string; ipHash?: string }): string | null {
  if (who.fid && Number.isSafeInteger(who.fid) && who.fid > 0) return `fid:${who.fid}`;
  if (who.address && who.ipHash) return `web:${who.address.toLowerCase()}:${who.ipHash}`;
  return null;
}
