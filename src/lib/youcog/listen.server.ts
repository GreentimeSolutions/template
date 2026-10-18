import { randomUUID } from "node:crypto";
import {
  LISTEN_MAX_STARTS_PER_DAY,
  LISTEN_SESSION_GRACE_SECONDS,
  LISTEN_SONG_SECONDS,
  LISTEN_TOLERANCE_SECONDS,
} from "../../constants/listen";
import { checkFinish } from "./listen-core";

/** Minimal SQL surface (Neon in prod, PGLite in tests). */
export type ListenSql = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

const utcDay = (nowMs: number) => new Date(nowMs).toISOString().slice(0, 10);

const toMs = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

export type StartResult = { ok: true; sessionId: string; songSeconds: number } | { ok: false; reason: string };
export type FinishResult = { ok: true } | { ok: false; reason: string };

/** Start a listen. Any earlier unfinished session for this identity is abandoned (one at a time). */
export async function startListen(
  sql: ListenSql,
  identity: string,
  source: string,
  nowMs = Date.now(),
): Promise<StartResult> {
  const day = utcDay(nowMs);
  const count = await sql<{ n: number }>`
    select count(*)::int as n from listen_sessions where identity = ${identity} and day = ${day}`;
  if (Number(count[0]?.n ?? 0) >= LISTEN_MAX_STARTS_PER_DAY) {
    return { ok: false, reason: "Too many listens today. Try again tomorrow." };
  }
  await sql`update listen_sessions set status = 'abandoned' where identity = ${identity} and status = 'started'`;
  const id = randomUUID();
  try {
    await sql`
      insert into listen_sessions (id, day, identity, source, status, started_at)
      values (${id}, ${day}, ${identity}, ${source.slice(0, 20)}, 'started', ${new Date(nowMs).toISOString()})`;
  } catch {
    return { ok: false, reason: "A listen is already running. Try again in a moment." };
  }
  return { ok: true, sessionId: id, songSeconds: LISTEN_SONG_SECONDS };
}

/** Finish a listen. Accepted only if enough wall-clock time passed since the server-recorded start. */
export async function finishListen(
  sql: ListenSql,
  input: { sessionId: string; identity: string; playedSeconds?: number },
  nowMs = Date.now(),
): Promise<FinishResult> {
  const rows = await sql<{ started_at: unknown; status: string }>`
    select started_at, status from listen_sessions where id = ${input.sessionId} and identity = ${input.identity} limit 1`;
  const row = rows[0];
  if (!row) return { ok: false, reason: "That listen session wasn't found." };
  if (row.status === "completed") return { ok: true };
  if (row.status !== "started") return { ok: false, reason: "That listen session ended. Start the song again." };
  const check = checkFinish({
    startedAtMs: toMs(row.started_at),
    nowMs,
    songSeconds: LISTEN_SONG_SECONDS,
    toleranceSeconds: LISTEN_TOLERANCE_SECONDS,
    graceSeconds: LISTEN_SESSION_GRACE_SECONDS,
  });
  if (!check.ok) {
    if (check.reason.includes("expired")) {
      await sql`update listen_sessions set status = 'abandoned' where id = ${input.sessionId}`;
    }
    return check;
  }
  const played = Number.isFinite(input.playedSeconds) ? Math.max(0, Math.min(36000, Number(input.playedSeconds))) : null;
  await sql`
    update listen_sessions set status = 'completed', finished_at = ${new Date(nowMs).toISOString()}, played_seconds = ${played}
    where id = ${input.sessionId} and status = 'started'`;
  return { ok: true };
}

/** A completed, unused listen for this identity today (the bonus is one per claim). */
export async function findBonusListen(sql: ListenSql, identity: string, nowMs = Date.now()): Promise<string | null> {
  const rows = await sql<{ id: string }>`
    select id from listen_sessions
    where identity = ${identity} and day = ${utcDay(nowMs)} and status = 'completed' and claim_id is null
    order by finished_at desc limit 1`;
  return rows[0]?.id ?? null;
}

/** Bind a listen to a claim; returns false if another claim already took it. */
export async function claimBonusListen(sql: ListenSql, listenId: string, claimId: number): Promise<boolean> {
  const rows = await sql`update listen_sessions set claim_id = ${claimId} where id = ${listenId} and claim_id is null returning id`;
  return rows.length > 0;
}

export async function releaseBonusListen(sql: ListenSql, listenId: string, claimId: number) {
  await sql`update listen_sessions set claim_id = null where id = ${listenId} and claim_id = ${claimId}`;
}

/** For the UI: does this identity have a boost ready today, or did it already use one? */
export async function listenStatus(sql: ListenSql, identity: string, nowMs = Date.now()) {
  const rows = await sql<{ status: string; claim_id: unknown }>`
    select status, claim_id from listen_sessions where identity = ${identity} and day = ${utcDay(nowMs)} and status = 'completed'`;
  return {
    unlocked: rows.some((r) => r.claim_id == null),
    used: rows.some((r) => r.claim_id != null),
    songSeconds: LISTEN_SONG_SECONDS,
  };
}
