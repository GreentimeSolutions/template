/**
 * "Your streak & tips" timeline: pure shaping and labels (no I/O), shared by the
 * server route, the sheet UI and unit tests.
 *
 * Privacy: the timeline only ever contains the signed-in FID's own faucet claims
 * and the anonymous tips that same FID sent. Nobody else's sender identity is read.
 */
import { isStreakBonusDay } from "./streak-core.ts";

export const TIMELINE_DEFAULT_LIMIT = 30;
export const TIMELINE_MAX_LIMIT = 50;

export type TimelineClaimRow = {
  id: number | string;
  day: string;
  amount: number | string;
  streak: number | string | null;
  tx_hash: string | null;
  created_at: string;
};

export type TimelineTipRow = {
  id: number | string;
  recipient_username: string;
  amount: number | string;
  status: string;
  tx_hash: string | null;
  created_at: string;
};

export type TimelineEvent =
  | {
      kind: "claim";
      id: string;
      at: string;
      day: string;
      streakDay: number;
      amount: number;
      bonus: boolean;
      txHash: string | null;
    }
  | {
      kind: "tip";
      id: string;
      at: string;
      day: string;
      recipientUsername: string;
      amount: number;
      /** "sent" (on Base, has txHash) or "held" (waiting for review, nothing sent yet). */
      state: "sent" | "held";
      txHash: string | null;
    };

/** Clamp a ?limit= query value. */
export function timelineLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return TIMELINE_DEFAULT_LIMIT;
  return Math.min(TIMELINE_MAX_LIMIT, Math.floor(n));
}

/** Parse a ?before= cursor (ISO timestamp); undefined when absent or invalid. */
export function timelineCursor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Postgres timestamptz::text ("2026-11-13 09:10:00.12+00") or ISO -> ISO UTC. */
export function toIso(s: string): string {
  const norm = String(s).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const t = Date.parse(norm);
  return Number.isFinite(t) ? new Date(t).toISOString() : String(s);
}

const isTxHash = (h: string | null | undefined): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h.trim());

/** Merge claims and own sent tips, newest first, capped at `limit`. */
export function buildTimeline(claims: TimelineClaimRow[], tips: TimelineTipRow[], limit: number): { events: TimelineEvent[]; nextBefore: string | null } {
  const events: TimelineEvent[] = [];
  for (const c of claims) {
    const streakDay = Math.max(1, Number(c.streak) || 1);
    events.push({
      kind: "claim",
      id: `c${c.id}`,
      at: toIso(c.created_at),
      day: String(c.day).slice(0, 10),
      streakDay,
      amount: Number(c.amount),
      bonus: isStreakBonusDay(streakDay),
      txHash: isTxHash(c.tx_hash) ? c.tx_hash.trim() : null,
    });
  }
  for (const t of tips) {
    const sent = t.status === "sent" && isTxHash(t.tx_hash);
    const held = t.status === "held" || t.status === "approving";
    if (!sent && !held) continue;
    const at = toIso(t.created_at);
    events.push({
      kind: "tip",
      id: `t${t.id}`,
      at,
      day: at.slice(0, 10),
      recipientUsername: String(t.recipient_username).replace(/^@/, ""),
      amount: Number(t.amount),
      state: sent ? "sent" : "held",
      txHash: sent ? String(t.tx_hash).trim() : null,
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  const page = events.slice(0, limit);
  const more = events.length > limit || claims.length >= limit || tips.length >= limit;
  return { events: page, nextBefore: more && page.length ? page[page.length - 1].at : null };
}

/** Thousands separators, always en-US ("2,220"). */
export function formatAmount(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today · Nov 13", "Yesterday · Nov 12", "Wed · Nov 11" — UTC days, like the faucet. */
export function whenLabel(day: string, nowMs: number = Date.now()): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const md = `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const sameYear = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear();
  const lead = day.slice(0, 10) === today ? "Today" : day.slice(0, 10) === y.toISOString().slice(0, 10) ? "Yesterday" : WEEKDAY[d.getUTCDay()];
  return `${lead} · ${md}${sameYear ? "" : `, ${d.getUTCFullYear()}`}`;
}
