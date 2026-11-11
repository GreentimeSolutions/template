/**
 * Pure spam / sybil rules for anonymous tips (no I/O). Shared by the server and tests.
 *
 * Outcomes, strongest first:
 *   deny        – clear abuse (shared wallets). Nothing reserved.
 *   hold        – whole tip waits for admin review; amount reserved, points pending.
 *   points_hold – tip sends, gift points stay pending for `pointsHoldDays`.
 *   allow       – today's behaviour.
 *
 * TIPS_RISK_MODE: off (default) | log (compute + record flags, never enforce) | enforce.
 */
import { envFlag } from "./anon-tips-core.ts";

export type RiskMode = "off" | "log" | "enforce";
export type RiskOutcome = "allow" | "points_hold" | "hold" | "deny";

export type TipRiskConfig = {
  mode: RiskMode;
  minScore: number; // H1: below -> hold
  softScore: number; // P1: below -> points hold
  minAgeDays: number; // H2
  minFollowers: number; // P2
  maxFollowRatio: number; // P2: following / followers above -> points hold
  reciprocalDays: number; // H3
  pairRepeatDays: number; // H5
  recipientDailyCount: number; // H6
  recipientDailyClaims: number; // H6: x claim amount
  globalDailyCount: number; // H7
  globalDailyClaims: number; // H7: x claim amount
  burstPerHour: number; // P3
  pointsHoldDays: number;
  holdExpireDays: number;
  cacheHours: number;
  adminFids: number[];
};

export const DEFAULT_TIP_RISK_CONFIG: TipRiskConfig = {
  mode: "off",
  minScore: 0.55,
  softScore: 0.7,
  minAgeDays: 30,
  minFollowers: 50,
  maxFollowRatio: 20,
  reciprocalDays: 14,
  pairRepeatDays: 7,
  recipientDailyCount: 3,
  recipientDailyClaims: 5,
  globalDailyCount: 40,
  globalDailyClaims: 40,
  burstPerHour: 3,
  pointsHoldDays: 7,
  holdExpireDays: 7,
  cacheHours: 24,
  adminFids: [209707],
};

function num(v: string | undefined, fallback: number, { allowZero = false } = {}): number {
  if (v == null || String(v).trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return fallback;
  return n;
}

export function parseRiskMode(v: string | undefined): RiskMode {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "enforce") return "enforce";
  if (s === "log" || s === "shadow") return "log";
  // TIPS_RISK_ON=1 alone means log-only, never enforce.
  return "off";
}

export function readTipRiskConfig(env: NodeJS.ProcessEnv = process.env): TipRiskConfig {
  const d = DEFAULT_TIP_RISK_CONFIG;
  let mode = parseRiskMode(env.TIPS_RISK_MODE);
  if (mode === "off" && envFlag(env.TIPS_RISK_ON)) mode = "log";
  const admins = String(env.ADMIN_FIDS ?? "")
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return {
    mode,
    minScore: num(env.TIPS_RISK_MIN_SCORE, d.minScore),
    softScore: num(env.TIPS_RISK_SOFT_SCORE, d.softScore),
    minAgeDays: num(env.TIPS_RISK_MIN_AGE_DAYS, d.minAgeDays),
    minFollowers: num(env.TIPS_RISK_MIN_FOLLOWERS, d.minFollowers),
    maxFollowRatio: num(env.TIPS_RISK_MAX_FOLLOW_RATIO, d.maxFollowRatio),
    reciprocalDays: num(env.TIPS_RECIPROCAL_DAYS, d.reciprocalDays),
    pairRepeatDays: num(env.TIPS_PAIR_REPEAT_DAYS, d.pairRepeatDays),
    recipientDailyCount: num(env.TIPS_RECIPIENT_DAILY_COUNT, d.recipientDailyCount),
    recipientDailyClaims: num(env.TIPS_RECIPIENT_DAILY_CLAIMS, d.recipientDailyClaims),
    globalDailyCount: num(env.TIPS_GLOBAL_DAILY_CAP, d.globalDailyCount),
    globalDailyClaims: num(env.TIPS_GLOBAL_DAILY_CLAIMS, d.globalDailyClaims),
    burstPerHour: num(env.TIPS_BURST_PER_HOUR, d.burstPerHour),
    pointsHoldDays: num(env.TIPS_POINTS_HOLD_DAYS, d.pointsHoldDays),
    holdExpireDays: num(env.TIPS_HOLD_EXPIRE_DAYS, d.holdExpireDays),
    cacheHours: num(env.NEYNAR_CACHE_HOURS, d.cacheHours),
    adminFids: admins.length ? admins : d.adminFids,
  };
}

/** Neynar profile facts we use (cached in fc_user_cache). */
export type FcProfile = {
  fid: number;
  score: number | null;
  registeredAt: string | null;
  followerCount: number | null;
  followingCount: number | null;
  custodyAddress: string | null;
  ethAddresses: string[];
  primaryEth: string | null;
};

export type TipRiskInput = {
  nowMs: number;
  amount: number;
  claimAmount: number;
  senderFid: number;
  recipientFid: number;
  /** Address the tip would be paid to. */
  recipientPayout: string;
  /** null = Neynar lookup failed for that side. */
  sender: FcProfile | null;
  recipient: FcProfile | null;
  /** Verified addresses from the free Farcaster API (already used for payouts). */
  senderAddresses: string[];
  recipientAddresses: string[];
  history: {
    /** Recipient tipped the sender within reciprocalDays. */
    reciprocalCount: number;
    /** Sender tipped this recipient within pairRepeatDays. */
    pairRepeatCount: number;
    recipientTodayCount: number;
    recipientTodayAmount: number;
    globalTodayCount: number;
    globalTodayAmount: number;
    senderLastHourCount: number;
    /** Recipient payout address appears in the sender's own faucet claims. */
    payoutInSenderClaims: boolean;
    /** Recipient addresses claimed under a different fid. */
    recipientWalletReuse: boolean;
    /** Sender and recipient share a web-claim ip_hash (last 30 days). */
    sharedIpHash: boolean;
  };
};

export type TipRiskResult = { outcome: RiskOutcome; flags: string[]; reason: string | null };

const FAUCET_WALLET = "0x3067ab541253746ab353b842fdc0970ffbde13c7";

function lowerSet(list: (string | null | undefined)[]): Set<string> {
  return new Set(list.filter((a): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)).map((a) => a.toLowerCase()));
}

function ageDays(registeredAt: string | null, nowMs: number): number | null {
  if (!registeredAt) return null;
  const t = Date.parse(registeredAt);
  return Number.isFinite(t) ? (nowMs - t) / 86_400_000 : null;
}

export const DENY_WALLET_REASON = "Tips can't go to a wallet linked to your own account.";
export const HELD_MESSAGE =
  "This tip is waiting for a quick review. Nothing has been sent yet, and the amount is set aside from your balance. If it isn't approved, it goes back to your balance.";
export const POINTS_PENDING_MESSAGE = "Gift points from this tip are pending review.";
export const REJECTED_MESSAGE = "This tip wasn't approved. The amount is back in your balance.";

export function evaluateTipRisk(input: TipRiskInput, config: TipRiskConfig = DEFAULT_TIP_RISK_CONFIG): TipRiskResult {
  const deny: string[] = [];
  const hold: string[] = [];
  const soft: string[] = [];
  const s = input.sender;
  const r = input.recipient;
  const h = input.history;

  // ---- Deny
  if (input.senderFid === input.recipientFid) deny.push("D1_self_tip");
  const senderAddrs = lowerSet([...input.senderAddresses, ...(s?.ethAddresses ?? []), s?.custodyAddress, s?.primaryEth]);
  const recipientAddrs = lowerSet([...input.recipientAddresses, ...(r?.ethAddresses ?? []), r?.custodyAddress, r?.primaryEth]);
  const payout = input.recipientPayout.toLowerCase();
  const overlap = [...recipientAddrs].some((a) => senderAddrs.has(a)) || senderAddrs.has(payout);
  if (overlap) deny.push("D2_shared_wallet");
  if (h.payoutInSenderClaims || payout === FAUCET_WALLET) deny.push("D3_payout_is_sender_claim_wallet");

  // ---- Hold (whole tip)
  if (!s || !r) hold.push("H0_neynar_unavailable");
  const minScore = (p: FcProfile | null) => (p?.score == null ? null : Number(p.score));
  const ss = minScore(s);
  const rs = minScore(r);
  if (s && (ss == null || ss < config.minScore)) hold.push("H1_sender_low_score");
  if (r && (rs == null || rs < config.minScore)) hold.push("H1_recipient_low_score");
  const sAge = s ? ageDays(s.registeredAt, input.nowMs) : null;
  const rAge = r ? ageDays(r.registeredAt, input.nowMs) : null;
  if (s && (sAge == null || sAge < config.minAgeDays)) hold.push("H2_sender_new_account");
  if (r && (rAge == null || rAge < config.minAgeDays)) hold.push("H2_recipient_new_account");
  if (h.reciprocalCount > 0) hold.push("H3_reciprocal");
  if (h.recipientWalletReuse) hold.push("H4_wallet_reuse");
  if (h.sharedIpHash) hold.push("H4_shared_ip");
  if (h.pairRepeatCount > 0) hold.push("H5_pair_repeat");
  if (h.recipientTodayCount >= config.recipientDailyCount || h.recipientTodayAmount + input.amount > config.recipientDailyClaims * input.claimAmount) {
    hold.push("H6_recipient_inflow");
  }
  if (h.globalTodayCount >= config.globalDailyCount || h.globalTodayAmount + input.amount > config.globalDailyClaims * input.claimAmount) {
    hold.push("H7_global_cap");
  }

  // ---- Points-only hold
  if (ss != null && ss >= config.minScore && ss < config.softScore) soft.push("P1_sender_soft_score");
  if (rs != null && rs >= config.minScore && rs < config.softScore) soft.push("P1_recipient_soft_score");
  const lowSocial = (p: FcProfile | null) => {
    if (!p) return false;
    const followers = p.followerCount ?? 0;
    const following = p.followingCount ?? 0;
    return followers < config.minFollowers || following / Math.max(1, followers) > config.maxFollowRatio;
  };
  if (lowSocial(s)) soft.push("P2_sender_low_social");
  if (lowSocial(r)) soft.push("P2_recipient_low_social");
  if (h.senderLastHourCount >= config.burstPerHour) soft.push("P3_burst");

  const flags = [...deny, ...hold, ...soft];
  if (deny.length) {
    return { outcome: "deny", flags, reason: deny.includes("D1_self_tip") ? "You can't tip yourself." : DENY_WALLET_REASON };
  }
  if (hold.length) return { outcome: "hold", flags, reason: HELD_MESSAGE };
  if (soft.length) return { outcome: "points_hold", flags, reason: POINTS_PENDING_MESSAGE };
  return { outcome: "allow", flags, reason: null };
}

export function isAdminFid(fid: number | undefined | null, config: TipRiskConfig = DEFAULT_TIP_RISK_CONFIG): boolean {
  return typeof fid === "number" && config.adminFids.includes(fid);
}
