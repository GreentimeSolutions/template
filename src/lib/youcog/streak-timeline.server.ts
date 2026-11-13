/** Read-only queries for the "Your streak & tips" timeline, always scoped to one verified FID. */
import { buildTimeline, type TimelineClaimRow, type TimelineTipRow } from "./streak-timeline-core.ts";

export type TimelineSql = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

/** The signed-in FID's own sent faucet claims and own anonymous tips (sent or held), newest first. */
export async function streakTimeline(sql: TimelineSql, fid: number, opts: { limit: number; before?: string }) {
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error("fid required");
  const before = opts.before ?? "9999-12-31T00:00:00Z";
  const claims = await sql<TimelineClaimRow>`
    select id, to_char(day, 'YYYY-MM-DD') as day, amount, streak, tx_hash, created_at::text as created_at
    from faucet_claims
    where fid = ${fid} and status = 'sent' and created_at < ${before}::timestamptz
    order by created_at desc
    limit ${opts.limit}`;
  const tips = await sql<TimelineTipRow>`
    select id, recipient_username, amount, status, tx_hash, created_at::text as created_at
    from anon_tips
    where sender_fid = ${fid} and status in ('sent', 'held', 'approving') and created_at < ${before}::timestamptz
    order by created_at desc
    limit ${opts.limit}`.catch(() => [] as TimelineTipRow[]);
  return buildTimeline(claims, tips, opts.limit);
}
