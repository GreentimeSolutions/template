import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";

/** Daily per-user + global caps for paid AI extras (voice, images). Shared in Neon so caps hold across instances. */
let ready: Promise<unknown> | null = null;
async function sqlReady() {
  const sql = await getSql();
  ready ??= sql`create table if not exists ai_usage (day text not null, kind text not null, who text not null, n int not null default 0, primary key (day, kind, who))`;
  await ready;
  return sql;
}

export function whoFromRequest(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  if (!ip) return "";
  const salt = process.env.FAUCET_IP_SALT ?? "youcog-faucet";
  return createHash("sha256").update(`${salt}:ai:${ip}`).digest("hex").slice(0, 32);
}

/** Reserve one use. Returns null if allowed, or a user-facing reason. */
export function ctDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}
const utcDay = () => new Date().toISOString().slice(0, 10);

export async function usedToday(kind: string, day = utcDay()): Promise<number> {
  const sql = await sqlReady();
  const r = await sql<{ n: number }>`select n from ai_usage where day = ${day} and kind = ${kind} and who = '*'`;
  return Number(r[0]?.n ?? 0);
}

export async function takeQuota(kind: string, who: string, perUser: number, global: number, day = utcDay()): Promise<string | null> {
  if (!who) return "Couldn't verify your connection. Try again later.";
  const sql = await sqlReady();
  const g = await sql`insert into ai_usage (day, kind, who, n) values (${day}, ${kind}, '*', 1)
    on conflict (day, kind, who) do update set n = ai_usage.n + 1 where ai_usage.n < ${global} returning n`;
  if (!g.length) return "Today's free limit for everyone is used up. Try again tomorrow (resets midnight UTC).";
  const u = await sql`insert into ai_usage (day, kind, who, n) values (${day}, ${kind}, ${who}, 1)
    on conflict (day, kind, who) do update set n = ai_usage.n + 1 where ai_usage.n < ${perUser} returning n`;
  if (!u.length) {
    await sql`update ai_usage set n = n - 1 where day = ${day} and kind = ${kind} and who = '*'`;
    return `You've used your ${perUser} for today. Come back after midnight UTC.`;
  }
  return null;
}

export async function refundQuota(kind: string, who: string, day = utcDay()) {
  const sql = await sqlReady();
  await sql`update ai_usage set n = greatest(n - 1, 0) where day = ${day} and kind = ${kind} and who in (${who}, '*')`;
}
