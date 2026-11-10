/** Pure anonymous-tip rules (no I/O), shared by the server and unit tests. */
import {
  GIFT_POINTS_PER_100_DEFAULT,
  TIP_DAILY_AMOUNT_CAP_DEFAULT,
  TIP_DAILY_COUNT_CAP_DEFAULT,
  TIP_MAX,
  TIP_MIN,
} from "../../constants/anon-tips.ts";

export type AnonTipsConfig = {
  min: number;
  max: number;
  dailyCountCap: number;
  dailyAmountCap: number;
  pointsPerHundred: number;
  suggested: readonly number[];
};

export const DEFAULT_ANON_TIPS_CONFIG: AnonTipsConfig = {
  min: TIP_MIN,
  max: TIP_MAX,
  dailyCountCap: TIP_DAILY_COUNT_CAP_DEFAULT,
  dailyAmountCap: TIP_DAILY_AMOUNT_CAP_DEFAULT,
  pointsPerHundred: GIFT_POINTS_PER_100_DEFAULT,
  suggested: [TIP_MIN, TIP_MIN * 2, TIP_MIN * 5],
};

export function envFlag(value: string | undefined | null): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function tipsLive(value = process.env.TIPS_LIVE): boolean {
  return envFlag(value);
}

export function redemptionOpen(value = process.env.TIPS_REDEMPTION_OPEN): boolean {
  return envFlag(value);
}

export function recordDryRun(value = process.env.TIPS_RECORD_DRY_RUN): boolean {
  return envFlag(value);
}

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function tipAmountsFromClaim(claim: number): Pick<AnonTipsConfig, "min" | "max" | "dailyAmountCap" | "suggested"> {
  const base = claim > 0 ? Math.floor(claim) : TIP_MIN;
  return {
    min: base,
    max: base * 5,
    dailyAmountCap: base * 10,
    suggested: [base, base * 2, base * 5],
  };
}

export function readAnonTipsConfig(env: NodeJS.ProcessEnv = process.env, claimAmount?: number): AnonTipsConfig {
  const derived = tipAmountsFromClaim(claimAmount ?? TIP_MIN);
  return {
    min: envInt(env.TIPS_MIN, derived.min),
    max: envInt(env.TIPS_MAX, derived.max),
    dailyCountCap: envInt(env.TIPS_DAILY_COUNT_CAP, TIP_DAILY_COUNT_CAP_DEFAULT),
    dailyAmountCap: envInt(env.TIPS_DAILY_AMOUNT_CAP, derived.dailyAmountCap),
    pointsPerHundred: envInt(env.GIFT_POINTS_PER_100, GIFT_POINTS_PER_100_DEFAULT),
    suggested: derived.suggested,
  };
}

/** Farcaster usernames: 1–16 letters, numbers, or hyphens. Strips a leading @. */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,15}$/.test(u)) return null;
  return u;
}

export function parseTipAmount(raw: unknown, config: AnonTipsConfig = DEFAULT_ANON_TIPS_CONFIG): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < config.min || n > config.max) return null;
  return n;
}

export function giftPointsFor(amount: number, pointsPerHundred = GIFT_POINTS_PER_100_DEFAULT): number {
  if (!Number.isFinite(amount) || amount <= 0 || pointsPerHundred <= 0) return 0;
  return Math.floor(amount / 100) * pointsPerHundred;
}

export function availableBalance(earned: number, tipped: number): number {
  const e = Number.isFinite(earned) ? earned : 0;
  const t = Number.isFinite(tipped) ? tipped : 0;
  return Math.max(0, e - t);
}

export function composeCastText(amount: number, username: string): string {
  const u = normalizeUsername(username);
  if (!u) throw new Error("Invalid username for cast text.");
  return `${amount}👻 @${u} — anonymous tip via Youcognito`;
}

/** Exactly one @mention, and never the sender's name. */
export function mentionCount(text: string): number {
  return (text.match(/@[a-z0-9][a-z0-9-]{0,15}\b/gi) ?? []).length;
}

export type TipGate =
  | { ok: true }
  | { ok: false; reason: string };

export function checkTipGate(input: {
  amount: number;
  available: number;
  todayCount: number;
  todayAmount: number;
  selfTip?: boolean;
  optedOut?: boolean;
  hasVerifiedAddress?: boolean;
  config?: AnonTipsConfig;
}): TipGate {
  const config = input.config ?? DEFAULT_ANON_TIPS_CONFIG;
  if (input.selfTip) return { ok: false, reason: "You can't tip yourself." };
  if (input.optedOut) return { ok: false, reason: "That user has opted out of receiving tips." };
  if (input.hasVerifiedAddress === false) {
    return { ok: false, reason: "That user hasn't verified a wallet address on Farcaster, so a tip can't be sent." };
  }
  if (!Number.isInteger(input.amount) || input.amount < config.min || input.amount > config.max) {
    return { ok: false, reason: `Pick a whole amount between ${config.min.toLocaleString()} and ${config.max.toLocaleString()} YOUCOG.` };
  }
  if (input.todayCount >= config.dailyCountCap) {
    return { ok: false, reason: `You've reached today's tip count limit (${config.dailyCountCap}).` };
  }
  if (input.todayAmount + input.amount > config.dailyAmountCap) {
    const left = Math.max(0, config.dailyAmountCap - input.todayAmount);
    return {
      ok: false,
      reason: left
        ? `That would go past today's tip total of ${config.dailyAmountCap.toLocaleString()} YOUCOG. You can still send up to ${left.toLocaleString()}.`
        : `You've reached today's tip total of ${config.dailyAmountCap.toLocaleString()} YOUCOG.`,
    };
  }
  if (input.amount > input.available) {
    return {
      ok: false,
      reason: input.available
        ? `You have ${input.available.toLocaleString()} YOUCOG available from faucet claims.`
        : "You don't have enough earned faucet claims to tip yet.",
    };
  }
  return { ok: true };
}

export const REDEMPTION_STUB_REASON = "Gift point rewards, if any, are announced separately.";

export function redeemGiftPointsStub(): { ok: false; reason: string } {
  return { ok: false, reason: REDEMPTION_STUB_REASON };
}
