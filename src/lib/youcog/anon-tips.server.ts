import { getAddress, isAddress } from "viem";
import {
  availableBalance,
  checkTipGate,
  baseScanTxUrl,
  composeCastEmbeds,
  CAST_SITE_DOMAIN,
  composeCastText,
  composeLiveCastText,
  giftPointsFor,
  mentionCount,
  urlsInCastText,
  normalizeUsername,
  parseTipAmount,
  redeemGiftPointsStub,
  redemptionOpen,
  type AnonTipsConfig,
} from "./anon-tips-core.ts";
import { HELD_MESSAGE, POINTS_PENDING_MESSAGE, type TipRiskConfig, type TipRiskResult } from "./tip-risk-core.ts";
import { assessTipRisk, type NeynarFetch } from "./tip-risk.server.ts";

/** Same address as holder.server FAUCET_WALLET; inlined so tests don't load chain code. */
const FAUCET_WALLET = "0x3067ab541253746AB353b842Fdc0970ffBDe13c7";

export type AnonTipsSql = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>;

export type FcUser = { fid: number; username: string };

export type AnonTipsDeps = {
  sql: AnonTipsSql;
  live: boolean;
  persistDryRun: boolean;
  config: AnonTipsConfig;
  nowMs?: number;
  lookupUser: (username: string) => Promise<FcUser | null>;
  addressesFor: (fid: number) => Promise<string[]>;
  sendYoucog: (to: `0x${string}`, amountWei: bigint) => Promise<`0x${string}`>;
  postCast: (text: string, embeds?: { url: string }[]) => Promise<string | null>;
  log?: (message: string, extra?: Record<string, unknown>) => void;
  /** Spam/sybil checks. Absent or mode "off" = today's behaviour (no Neynar calls). */
  risk?: { config: TipRiskConfig; fetchProfiles: NeynarFetch };
};

/** Tip statuses that use up the sender's balance (held/approving reserve it). */
export const BALANCE_STATUSES = ["sent", "dry_run", "held", "approving"] as const;

export type TipHistoryItem = {
  amount: number;
  recipientUsername: string;
  giftPoints: number;
  createdAt: string;
  dryRun: boolean;
  txHash: string | null;
  /** Waiting for review: nothing sent yet, amount set aside. */
  held: boolean;
  /** Gift points from this tip are pending review. */
  pointsPending: boolean;
};

export type AnonTipsStatus = {
  ok: true;
  available: number;
  earned: number;
  tipped: number;
  giftPoints: number;
  tipCount: number;
  todayCount: number;
  todayAmount: number;
  dailyCountCap: number;
  dailyAmountCap: number;
  min: number;
  max: number;
  suggested: readonly number[];
  pointsPerHundred: number;
  live: boolean;
  redemptionOpen: boolean;
  optedOut: boolean;
  tablesReady: boolean;
  recentTips: TipHistoryItem[];
  heldCount: number;
  heldAmount: number;
  pendingPoints: number;
};

export type SendTipResult =
  | {
      ok: true;
      amount: number;
      giftPoints: number;
      recipientUsername: string;
      recipientAddress: string;
      castText: string;
      dryRun: boolean;
      txHash: string | null;
      url: string | null;
      castHash: string | null;
      /** Whole tip waiting for admin review (nothing sent or posted). */
      held?: boolean;
      /** Tip sent, gift points pending review. */
      pointsPending?: boolean;
      message?: string;
    }
  | { ok: false; reason: string };

const TABLES_MISSING = /relation .* does not exist/i;

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayBounds(ms: number): { start: string; end: string } {
  const day = utcDay(ms);
  return { start: `${day}T00:00:00.000Z`, end: `${utcDay(ms + 86_400_000)}T00:00:00.000Z` };
}

function missingTables(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TABLES_MISSING.test(msg);
}

async function tablesReady(sql: AnonTipsSql): Promise<boolean> {
  try {
    await sql`select 1 from anon_tips limit 0`;
    await sql`select 1 from tip_opt_outs limit 0`;
    await sql`select 1 from gift_points limit 0`;
    await sql`select 1 from gift_points_ledger limit 0`;
    return true;
  } catch (err) {
    if (missingTables(err)) return false;
    throw err;
  }
}

async function earnedFor(sql: AnonTipsSql, fid: number, addresses: string[]): Promise<number> {
  const [byFid] = await sql<{ earned: string }>`
    select coalesce(sum(amount), 0)::text as earned
    from faucet_claims
    where status = 'sent' and fid = ${fid}`;
  let earned = Number(byFid?.earned ?? 0);
  const extras = addresses
    .filter((a) => isAddress(a, { strict: false }))
    .map((a) => getAddress(a).toLowerCase());
  if (extras.length) {
    const [byAddr] = await sql<{ earned: string }>`
      select coalesce(sum(amount), 0)::text as earned
      from faucet_claims
      where status = 'sent' and fid is null and lower(address) = any(${extras})`;
    earned += Number(byAddr?.earned ?? 0);
  }
  try {
    const [adj] = await sql<{ earned: string }>`
      select coalesce(sum(amount), 0)::text as earned
      from tip_balance_adjustments
      where fid = ${fid}`;
    earned += Number(adj?.earned ?? 0);
  } catch (err) {
    if (!missingTables(err)) throw err;
  }
  return Number.isFinite(earned) ? earned : 0;
}

async function tipTotals(sql: AnonTipsSql, fid: number, ready: boolean, nowMs: number) {
  if (!ready) {
    return {
      tipped: 0,
      giftPoints: 0,
      tipCount: 0,
      todayCount: 0,
      todayAmount: 0,
      recentTips: [] as TipHistoryItem[],
      heldCount: 0,
      heldAmount: 0,
      pendingPoints: 0,
    };
  }
  const statuses = [...BALANCE_STATUSES];
  const [all] = await sql<{ tipped: string; points: string; n: string }>`
    select coalesce(sum(amount), 0)::text as tipped,
      coalesce(sum(gift_points), 0)::text as points,
      count(*)::text as n
    from anon_tips
    where sender_fid = ${fid} and status = any(${statuses})`;
  const { start, end } = dayBounds(nowMs);
  const [today] = await sql<{ tipped: string; n: string }>`
    select coalesce(sum(amount), 0)::text as tipped, count(*)::text as n
    from anon_tips
    where sender_fid = ${fid} and status = any(${statuses})
      and created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz`;
  const [held] = await sql<{ tipped: string; n: string }>`
    select coalesce(sum(amount), 0)::text as tipped, count(*)::text as n
    from anon_tips where sender_fid = ${fid} and status in ('held', 'approving')`;
  const [gp] = await sql<{ points: string }>`
    select points::text as points from gift_points where fid = ${fid}`.catch(() => [{ points: all?.points ?? "0" }]);
  const [pending] = await sql<{ points: string }>`
    select coalesce(sum(points), 0)::text as points from gift_points_ledger
    where fid = ${fid} and state = 'pending'`.catch(() => [{ points: "0" }]);
  const recent = await sql<{
    amount: number;
    recipient_username: string;
    gift_points: number;
    created_at: string;
    status: string;
    tx_hash: string | null;
    points_pending: boolean | null;
  }>`
    select t.amount, t.recipient_username, t.gift_points, t.created_at::text as created_at, t.status, t.tx_hash,
      exists (select 1 from gift_points_ledger l where l.tip_id = t.id and l.state = 'pending') as points_pending
    from anon_tips t
    where t.sender_fid = ${fid} and t.status = any(${statuses})
    order by t.created_at desc
    limit 20`;
  return {
    tipped: Number(all?.tipped ?? 0),
    giftPoints: Number(gp?.points ?? 0),
    tipCount: Number(all?.n ?? 0),
    todayCount: Number(today?.n ?? 0),
    todayAmount: Number(today?.tipped ?? 0),
    heldCount: Number(held?.n ?? 0),
    heldAmount: Number(held?.tipped ?? 0),
    pendingPoints: Number(pending?.points ?? 0),
    recentTips: recent.map((r) => ({
      amount: Number(r.amount),
      recipientUsername: String(r.recipient_username),
      giftPoints: Number(r.gift_points),
      createdAt: String(r.created_at),
      dryRun: r.status === "dry_run",
      txHash: r.tx_hash,
      held: r.status === "held" || r.status === "approving",
      pointsPending: Boolean(r.points_pending),
    })),
  };
}

export async function anonTipsStatus(deps: AnonTipsDeps, fid: number): Promise<AnonTipsStatus> {
  const nowMs = deps.nowMs ?? Date.now();
  const ready = await tablesReady(deps.sql);
  let addresses: string[] = [];
  try {
    addresses = await deps.addressesFor(fid);
  } catch {
    addresses = [];
  }
  const earned = await earnedFor(deps.sql, fid, addresses);
  const totals = await tipTotals(deps.sql, fid, ready, nowMs);
  let optedOut = false;
  if (ready) {
    const rows = await deps.sql<{ fid: number }>`select fid from tip_opt_outs where fid = ${fid} limit 1`;
    optedOut = rows.length > 0;
  }
  return {
    ok: true,
    available: availableBalance(earned, totals.tipped),
    earned,
    tipped: totals.tipped,
    giftPoints: totals.giftPoints,
    tipCount: totals.tipCount,
    todayCount: totals.todayCount,
    todayAmount: totals.todayAmount,
    dailyCountCap: deps.config.dailyCountCap,
    dailyAmountCap: deps.config.dailyAmountCap,
    min: deps.config.min,
    max: deps.config.max,
    suggested: deps.config.suggested ?? [deps.config.min, deps.config.max],
    pointsPerHundred: deps.config.pointsPerHundred,
    live: deps.live,
    redemptionOpen: redemptionOpen(),
    optedOut,
    tablesReady: ready,
    recentTips: totals.recentTips,
    heldCount: totals.heldCount,
    heldAmount: totals.heldAmount,
    pendingPoints: totals.pendingPoints,
  };
}

export async function setTipOptOut(deps: AnonTipsDeps, fid: number, optOut: boolean): Promise<{ ok: true; optedOut: boolean } | { ok: false; reason: string }> {
  const ready = await tablesReady(deps.sql);
  if (!ready) return { ok: false, reason: "Anonymous tips aren't set up on this database yet." };
  if (optOut) {
    await deps.sql`insert into tip_opt_outs (fid) values (${fid}) on conflict (fid) do nothing`;
  } else {
    await deps.sql`delete from tip_opt_outs where fid = ${fid}`;
  }
  return { ok: true, optedOut: optOut };
}

export type PersistTipRow = {
  senderFid: number;
  recipientFid: number;
  recipientUsername: string;
  recipientAddress: string;
  amount: number;
  giftPoints: number;
  status: "sent" | "dry_run" | "held";
  txHash: string | null;
  castHash: string | null;
  createdAt: string;
  reviewState?: "none" | "held";
  riskFlags?: string[];
  /** credited (default) | pending (points-only hold or held tip). */
  pointsState?: "credited" | "pending";
  pointsReleaseAt?: string | null;
  /** Decision trail row (shadow | hold | points_hold), written in the same statement. */
  decision?: string | null;
};

/**
 * One statement = one transaction: the tip, its gift-points ledger row, the running
 * totals and the optional decision row all commit together (or not at all), so the
 * hash-chained ledger never records half a tip.
 */
export async function persistTip(sql: AnonTipsSql, row: PersistTipRow): Promise<number> {
  const counts = row.status === "sent" || row.status === "dry_run";
  const pointsState = row.pointsState ?? "credited";
  const credited = counts && pointsState === "credited";
  const inserted = await sql<{ id: number }>`
    with t as (
      insert into anon_tips (
        sender_fid, recipient_fid, recipient_username, recipient_address,
        amount, gift_points, status, tx_hash, cast_hash, created_at, review_state, risk_flags
      ) values (
        ${row.senderFid}, ${row.recipientFid}, ${row.recipientUsername}, ${row.recipientAddress},
        ${row.amount}, ${row.giftPoints}, ${row.status}, ${row.txHash}, ${row.castHash}, ${row.createdAt}::timestamptz,
        ${row.reviewState ?? "none"}, ${row.riskFlags ?? []}::text[]
      ) returning id, sender_fid
    ), l as (
      insert into gift_points_ledger (fid, tip_id, points, amount, note, state, release_at, created_at)
      select t.sender_fid, t.id, ${row.giftPoints}, ${row.amount}, ${row.status}, ${pointsState},
        ${row.pointsReleaseAt ?? null}::timestamptz, ${row.createdAt}::timestamptz
      from t returning id
    ), g as (
      insert into gift_points (fid, points, tipped_amount, tip_count, updated_at)
      select t.sender_fid, ${credited ? row.giftPoints : 0}, ${counts ? row.amount : 0}, ${counts ? 1 : 0}, ${row.createdAt}::timestamptz
      from t where ${counts}::boolean
      on conflict (fid) do update set
        points = gift_points.points + excluded.points,
        tipped_amount = gift_points.tipped_amount + excluded.tipped_amount,
        tip_count = gift_points.tip_count + excluded.tip_count,
        updated_at = excluded.updated_at
      returning fid
    ), v as (
      insert into tip_risk_reviews (tip_id, decision, flags, actor, created_at)
      select t.id, ${row.decision ?? null}::text, ${row.riskFlags ?? []}::text[], 'system', ${row.createdAt}::timestamptz
      from t where ${row.decision ?? null}::text is not null
      returning id
    )
    select t.id from t`;
  return Number(inserted[0]?.id);
}

export async function sendAnonTip(
  deps: AnonTipsDeps,
  input: { senderFid: number; username: unknown; amount: unknown },
): Promise<SendTipResult> {
  const username = normalizeUsername(input.username);
  if (!username) return { ok: false, reason: "Enter a Farcaster username, like nick." };
  const amount = parseTipAmount(input.amount, deps.config);
  if (amount == null) {
    return {
      ok: false,
      reason: `Pick a whole amount between ${deps.config.min.toLocaleString()} and ${deps.config.max.toLocaleString()} YOUCOG.`,
    };
  }

  const user = await deps.lookupUser(username);
  if (!user) return { ok: false, reason: "Couldn't find that Farcaster username." };

  let recipientAddresses: string[] = [];
  try {
    recipientAddresses = await deps.addressesFor(user.fid);
  } catch {
    recipientAddresses = [];
  }
  const recipientAddress = recipientAddresses.map((a) => (isAddress(a, { strict: false }) ? getAddress(a) : null)).find((a) => a && a.toLowerCase() !== FAUCET_WALLET.toLowerCase()) ?? null;

  let senderAddresses: string[] = [];
  try {
    senderAddresses = await deps.addressesFor(input.senderFid);
  } catch {
    senderAddresses = [];
  }

  const nowMs = deps.nowMs ?? Date.now();
  const ready = await tablesReady(deps.sql);
  const earned = await earnedFor(deps.sql, input.senderFid, senderAddresses);
  const totals = await tipTotals(deps.sql, input.senderFid, ready, nowMs);

  let optedOut = false;
  if (ready) {
    const rows = await deps.sql<{ fid: number }>`select fid from tip_opt_outs where fid = ${user.fid} limit 1`;
    optedOut = rows.length > 0;
  }

  const gate = checkTipGate({
    amount,
    available: availableBalance(earned, totals.tipped),
    todayCount: totals.todayCount,
    todayAmount: totals.todayAmount,
    selfTip: user.fid === input.senderFid,
    optedOut,
    hasVerifiedAddress: Boolean(recipientAddress),
    config: deps.config,
  });
  if (!gate.ok) return gate;
  if (!recipientAddress) {
    return { ok: false, reason: "That user hasn't verified a wallet address on Farcaster, so a tip can't be sent." };
  }

  const points = giftPointsFor(amount, deps.config.pointsPerHundred);
  const castText = composeCastText(amount, user.username);
  const urls = urlsInCastText(castText);
  if (mentionCount(castText) !== 1 || urls.length !== 1 || urls[0] !== CAST_SITE_DOMAIN) {
    return { ok: false, reason: "Couldn't compose a valid tip post." };
  }

  const createdAt = new Date(nowMs).toISOString();
  const dry = !deps.live;

  // ---- Spam / sybil checks (TIPS_RISK_MODE: off | log | enforce)
  const mode = deps.risk?.config.mode ?? "off";
  let risk: TipRiskResult | null = null;
  if (deps.risk && mode !== "off" && ready) {
    try {
      risk = await assessTipRisk(deps.sql, deps.risk.fetchProfiles, {
        nowMs,
        amount,
        claimAmount: deps.config.min,
        senderFid: input.senderFid,
        recipientFid: user.fid,
        recipientPayout: recipientAddress,
        senderAddresses,
        recipientAddresses,
        config: deps.risk.config,
      });
    } catch (err) {
      // A broken check fails safe: hold in enforce mode, just log in log mode.
      risk = { outcome: "hold", flags: ["H0_check_failed"], reason: HELD_MESSAGE };
      console.error("[tip-risk] check failed:", (err instanceof Error ? err.message : String(err)).slice(0, 200));
    }
    deps.log?.("[tip-risk]", { mode, outcome: risk.outcome, flags: risk.flags, recipientFid: user.fid, amount });
  }
  const enforce = mode === "enforce" && risk != null;
  const flags = risk?.flags ?? [];
  const shadowDecision = mode === "log" && risk && risk.outcome !== "allow" ? "shadow" : null;

  if (enforce && risk!.outcome === "deny") {
    return { ok: false, reason: risk!.reason ?? "This tip can't be sent." };
  }

  if (enforce && risk!.outcome === "hold") {
    // Nothing sent or cast. Amount is reserved (status held counts against the balance).
    // Preview dry-runs without TIPS_RECORD_DRY_RUN write nothing, same as other dry-runs.
    if (!dry || deps.persistDryRun) await persistTip(deps.sql, {
      senderFid: input.senderFid,
      recipientFid: user.fid,
      recipientUsername: user.username,
      recipientAddress,
      amount,
      giftPoints: points,
      status: "held",
      txHash: null,
      castHash: null,
      createdAt,
      reviewState: "held",
      riskFlags: flags,
      pointsState: "pending",
      decision: "hold",
    });
    return {
      ok: true,
      amount,
      giftPoints: points,
      recipientUsername: user.username,
      recipientAddress,
      castText,
      dryRun: dry,
      txHash: null,
      url: null,
      castHash: null,
      held: true,
      pointsPending: true,
      message: HELD_MESSAGE,
    };
  }

  const pointsHold = enforce && risk!.outcome === "points_hold";
  const holdDays = deps.risk?.config.pointsHoldDays ?? 7;
  const riskRowFields = {
    riskFlags: flags,
    pointsState: pointsHold ? ("pending" as const) : ("credited" as const),
    pointsReleaseAt: pointsHold ? new Date(nowMs + holdDays * 86_400_000).toISOString() : null,
    decision: pointsHold ? "points_hold" : shadowDecision,
  };

  if (dry) {
    deps.log?.("[anon-tips] dry-run", {
      to: recipientAddress,
      amount,
      castText,
      castEmbeds: "https://youcognito.com/tip/<hash> after transfer (text adds Verified here: BaseScan link)",
      senderFid: input.senderFid,
      recipientFid: user.fid,
      recipientUsername: user.username,
    });
    if (deps.persistDryRun) {
      if (!ready) return { ok: false, reason: "Anonymous tips aren't set up on this database yet." };
      await persistTip(deps.sql, {
        senderFid: input.senderFid,
        recipientFid: user.fid,
        recipientUsername: user.username,
        recipientAddress,
        amount,
        giftPoints: points,
        status: "dry_run",
        txHash: null,
        castHash: null,
        createdAt,
        ...riskRowFields,
      });
    }
    return {
      ok: true,
      amount,
      giftPoints: points,
      recipientUsername: user.username,
      recipientAddress,
      castText,
      dryRun: true,
      txHash: null,
      url: null,
      castHash: null,
      ...(pointsHold ? { pointsPending: true, message: POINTS_PENDING_MESSAGE } : {}),
    };
  }

  // Live path: send first, then try to cast. Never reached when TIPS_LIVE is false.
  let txHash: `0x${string}`;
  try {
    txHash = await deps.sendYoucog(recipientAddress as `0x${string}`, BigInt(amount) * 10n ** 18n);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "send failed";
    console.error("[anon-tips] transfer failed:", msg.slice(0, 300));
    return { ok: false, reason: "The transfer didn't go through. Nothing was used up, so you can try again." };
  }

  const url = baseScanTxUrl(txHash);
  let castHash: string | null = null;
  try {
    castHash = await deps.postCast(composeLiveCastText(amount, user.username, txHash), composeCastEmbeds(txHash));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "cast failed";
    console.error("[anon-tips] cast failed after payout:", msg.slice(0, 300));
  }

  if (ready) {
    try {
      await persistTip(deps.sql, {
        senderFid: input.senderFid,
        recipientFid: user.fid,
        recipientUsername: user.username,
        recipientAddress,
        amount,
        giftPoints: points,
        status: "sent",
        txHash,
        castHash,
        createdAt,
        ...riskRowFields,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "persist failed";
      console.error("[anon-tips] payout sent but record failed:", msg.slice(0, 300));
    }
  }

  return {
    ok: true,
    amount,
    giftPoints: points,
    recipientUsername: user.username,
    recipientAddress,
    castText,
    dryRun: false,
    txHash,
    url,
    castHash,
    ...(pointsHold ? { pointsPending: true, message: POINTS_PENDING_MESSAGE } : {}),
  };
}

export function redeemGiftPoints(): { ok: false; reason: string } {
  return redeemGiftPointsStub();
}

export { redemptionOpen };
