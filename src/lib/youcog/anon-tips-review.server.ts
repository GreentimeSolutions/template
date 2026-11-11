/**
 * Admin review for held tips and pending gift points (Andy only, ADMIN_FIDS).
 * Every decision appends a tip_risk_reviews row, which the ledger chains.
 *
 * approve: held -> approving (conditional update, so a retry can't double-send)
 *          -> live: send + cast -> sent | not live: dry_run; points credited.
 * reject / expire: amount released back to the balance, points void.
 */
import { composeCastEmbeds, composeLiveCastText } from "./anon-tips-core.ts";
import type { AnonTipsDeps, AnonTipsSql } from "./anon-tips.server.ts";
import { DEFAULT_TIP_RISK_CONFIG, type TipRiskConfig } from "./tip-risk-core.ts";

export type HeldTip = {
  id: number;
  recipientFid: number;
  recipientUsername: string;
  recipientAddress: string;
  amount: number;
  giftPoints: number;
  status: string;
  reviewState: string;
  riskFlags: string[];
  createdAt: string;
};

export type ReviewAction = "approve" | "reject" | "void_points" | "release_points";

type TipRow = {
  id: number;
  sender_fid: number;
  recipient_fid: number;
  recipient_username: string;
  recipient_address: string;
  amount: number;
  gift_points: number;
  status: string;
  review_state: string;
  risk_flags: string[] | null;
  created_at: string;
};

function toHeld(r: TipRow): HeldTip {
  return {
    id: Number(r.id),
    recipientFid: Number(r.recipient_fid),
    recipientUsername: r.recipient_username,
    recipientAddress: r.recipient_address,
    amount: Number(r.amount),
    giftPoints: Number(r.gift_points),
    status: r.status,
    reviewState: r.review_state,
    riskFlags: r.risk_flags ?? [],
    createdAt: String(r.created_at),
  };
}

/** Review queue. Sender fids are not returned (tips stay anonymous even to the reviewer UI). */
export async function listReviewQueue(sql: AnonTipsSql) {
  const held = await sql<TipRow>`
    select id, sender_fid, recipient_fid, recipient_username, recipient_address, amount, gift_points, status,
      review_state, risk_flags, created_at::text as created_at
    from anon_tips where status in ('held', 'approving') order by created_at asc limit 100`;
  const pending = await sql<TipRow & { release_at: string; ledger_id: number }>`
    select t.id, t.sender_fid, t.recipient_fid, t.recipient_username, t.recipient_address, t.amount, t.gift_points,
      t.status, t.review_state, t.risk_flags, t.created_at::text as created_at,
      l.release_at::text as release_at, l.id as ledger_id
    from gift_points_ledger l join anon_tips t on t.id = l.tip_id
    where l.state = 'pending' and t.status in ('sent', 'dry_run')
    order by l.release_at asc limit 100`;
  const shadow = await sql<{ tip_id: number; flags: string[]; created_at: string }>`
    select tip_id, flags, created_at::text as created_at from tip_risk_reviews
    where decision = 'shadow' order by created_at desc limit 50`;
  return {
    ok: true as const,
    held: held.map(toHeld),
    pointsPending: pending.map((r) => ({ ...toHeld(r), releaseAt: r.release_at })),
    recentShadowFlags: shadow.map((r) => ({ tipId: Number(r.tip_id), flags: r.flags ?? [], createdAt: r.created_at })),
  };
}

async function addReview(sql: AnonTipsSql, tipId: number, decision: string, actor: string, flags: string[] = [], note: string | null = null) {
  await sql`insert into tip_risk_reviews (tip_id, decision, flags, actor, note) values (${tipId}, ${decision}, ${flags}::text[], ${actor}, ${note})`;
}

/** Credit pending points for a tip (one statement). Returns points credited. */
async function creditPoints(sql: AnonTipsSql, tipId: number, alsoCountTip: boolean): Promise<number> {
  const rows = await sql<{ points: number }>`
    with l as (
      update gift_points_ledger set state = 'credited'
      where tip_id = ${tipId} and state = 'pending'
      returning fid, points, amount
    ), g as (
      insert into gift_points (fid, points, tipped_amount, tip_count, updated_at)
      select fid, points, case when ${alsoCountTip}::boolean then amount else 0 end,
        case when ${alsoCountTip}::boolean then 1 else 0 end, now() from l
      on conflict (fid) do update set
        points = gift_points.points + excluded.points,
        tipped_amount = gift_points.tipped_amount + excluded.tipped_amount,
        tip_count = gift_points.tip_count + excluded.tip_count,
        updated_at = excluded.updated_at
      returning fid
    )
    select coalesce(sum(points), 0)::int as points from l`;
  return Number(rows[0]?.points ?? 0);
}

async function voidPoints(sql: AnonTipsSql, tipId: number) {
  await sql`update gift_points_ledger set state = 'void' where tip_id = ${tipId} and state = 'pending'`;
}

export async function approveHeldTip(deps: AnonTipsDeps, tipId: number, adminFid: number) {
  const actor = `admin:${adminFid}`;
  const [t] = await deps.sql<TipRow>`
    update anon_tips set status = 'approving'
    where id = ${tipId} and status = 'held'
    returning id, sender_fid, recipient_fid, recipient_username, recipient_address, amount, gift_points, status,
      review_state, risk_flags, created_at::text as created_at`;
  if (!t) return { ok: false as const, reason: "That tip isn't waiting for review (already handled?)." };

  // Re-check at approval time: recipient may have opted out since.
  const opted = await deps.sql`select 1 from tip_opt_outs where fid = ${t.recipient_fid} limit 1`;
  if (opted.length) {
    await deps.sql`update anon_tips set status = 'rejected', review_state = 'rejected', reviewed_by = ${actor}, reviewed_at = now() where id = ${tipId}`;
    await voidPoints(deps.sql, tipId);
    await addReview(deps.sql, tipId, "reject", actor, [], "recipient opted out before approval");
    return { ok: false as const, reason: "The recipient opted out, so the tip was released back to the sender." };
  }

  let finalStatus: "sent" | "dry_run" = "dry_run";
  let txHash: string | null = null;
  let castHash: string | null = null;
  if (deps.live) {
    try {
      txHash = await deps.sendYoucog(t.recipient_address as `0x${string}`, BigInt(t.amount) * 10n ** 18n);
    } catch (err) {
      await deps.sql`update anon_tips set status = 'held' where id = ${tipId} and status = 'approving'`;
      console.error("[tip-review] transfer failed:", (err instanceof Error ? err.message : String(err)).slice(0, 200));
      return { ok: false as const, reason: "The transfer didn't go through; the tip is still held." };
    }
    finalStatus = "sent";
    try {
      castHash = await deps.postCast(composeLiveCastText(Number(t.amount), t.recipient_username, txHash), composeCastEmbeds(txHash));
    } catch (err) {
      console.error("[tip-review] cast failed after payout:", (err instanceof Error ? err.message : String(err)).slice(0, 200));
    }
  }
  await deps.sql`
    update anon_tips set status = ${finalStatus}, tx_hash = ${txHash}, cast_hash = ${castHash},
      review_state = 'approved', reviewed_by = ${actor}, reviewed_at = now()
    where id = ${tipId} and status = 'approving'`;
  const credited = await creditPoints(deps.sql, tipId, true);
  await addReview(deps.sql, tipId, "approve", actor);
  return { ok: true as const, tipId, status: finalStatus, txHash, castHash, pointsCredited: credited };
}

export async function rejectHeldTip(sql: AnonTipsSql, tipId: number, adminFid: number, note: string | null = null) {
  const actor = `admin:${adminFid}`;
  const rows = await sql`
    update anon_tips set status = 'rejected', review_state = 'rejected', reviewed_by = ${actor}, reviewed_at = now()
    where id = ${tipId} and status = 'held' returning id`;
  if (!rows.length) return { ok: false as const, reason: "That tip isn't waiting for review." };
  await voidPoints(sql, tipId);
  await addReview(sql, tipId, "reject", actor, [], note);
  return { ok: true as const, tipId, status: "rejected" };
}

export async function releasePendingPoints(sql: AnonTipsSql, tipId: number, actor: string) {
  const [t] = await sql<{ status: string }>`select status from anon_tips where id = ${tipId}`;
  if (!t || (t.status !== "sent" && t.status !== "dry_run")) return { ok: false as const, reason: "No pending points on a sent tip." };
  const credited = await creditPoints(sql, tipId, false);
  if (!credited) return { ok: false as const, reason: "No pending points on that tip." };
  await addReview(sql, tipId, "release_points", actor);
  return { ok: true as const, tipId, pointsCredited: credited };
}

export async function voidPendingPoints(sql: AnonTipsSql, tipId: number, adminFid: number, note: string | null = null) {
  const rows = await sql`update gift_points_ledger set state = 'void' where tip_id = ${tipId} and state = 'pending' returning id`;
  if (!rows.length) return { ok: false as const, reason: "No pending points on that tip." };
  await addReview(sql, tipId, "void_points", `admin:${adminFid}`, [], note);
  return { ok: true as const, tipId };
}

/** Daily sweep: expire stale held tips, release points whose hold ended. */
export async function sweepTipReviews(sql: AnonTipsSql, nowMs = Date.now(), config: TipRiskConfig = DEFAULT_TIP_RISK_CONFIG) {
  const cutoff = new Date(nowMs - config.holdExpireDays * 86_400_000).toISOString();
  const expired = await sql<{ id: number }>`
    update anon_tips set status = 'expired', review_state = 'expired', reviewed_by = 'system', reviewed_at = ${new Date(nowMs).toISOString()}::timestamptz
    where status = 'held' and created_at < ${cutoff}::timestamptz returning id`;
  for (const { id } of expired) {
    await voidPoints(sql, Number(id));
    await addReview(sql, Number(id), "expire", "system");
  }
  const due = await sql<{ tip_id: number }>`
    select distinct l.tip_id from gift_points_ledger l join anon_tips t on t.id = l.tip_id
    where l.state = 'pending' and l.release_at <= ${new Date(nowMs).toISOString()}::timestamptz and t.status in ('sent', 'dry_run')`;
  let released = 0;
  for (const { tip_id } of due) {
    const r = await releasePendingPoints(sql, Number(tip_id), "system");
    if (r.ok) released += 1;
  }
  return { ok: true as const, expired: expired.length, released };
}
