import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { checkFinish, listenIdentity, pickClaimAmount } from "./listen-core";
import { findBonusListen, finishListen, listenStatus, startListen, claimBonusListen, type ListenSql } from "./listen.server";
import { LISTEN_BONUS_AMOUNT, LISTEN_MIN_FAUCET_BALANCE, LISTEN_SONG_SECONDS, LISTEN_TOLERANCE_SECONDS } from "../../constants/listen";

const SONG = LISTEN_SONG_SECONDS;
const TOL = LISTEN_TOLERANCE_SECONDS;

test("checkFinish rejects an early finish", () => {
  const r = checkFinish({ startedAtMs: 0, nowMs: (SONG - TOL - 1) * 1000, songSeconds: SONG, toleranceSeconds: TOL, graceSeconds: 900 });
  assert.equal(r.ok, false);
});

test("checkFinish accepts a full listen (within tolerance)", () => {
  const r = checkFinish({ startedAtMs: 0, nowMs: (SONG - TOL) * 1000, songSeconds: SONG, toleranceSeconds: TOL, graceSeconds: 900 });
  assert.equal(r.ok, true);
});

test("checkFinish rejects a stale session", () => {
  const r = checkFinish({ startedAtMs: 0, nowMs: (SONG + 901) * 1000, songSeconds: SONG, toleranceSeconds: TOL, graceSeconds: 900 });
  assert.equal(r.ok, false);
});

test("pickClaimAmount switches to the bonus only when eligible and the faucet can afford it", () => {
  const base = { baseAmount: 6969, multiplier: 1, bonusAmount: LISTEN_BONUS_AMOUNT, minFaucetBalanceTokens: LISTEN_MIN_FAUCET_BALANCE };
  assert.deepEqual(pickClaimAmount({ ...base, bonusEligible: false, faucetBalanceTokens: 39_800_000 }), { amount: 6969, bonus: false });
  assert.deepEqual(pickClaimAmount({ ...base, bonusEligible: true, faucetBalanceTokens: 39_800_000 }), { amount: 100_000, bonus: true });
  // Safety cap: under 2M left after paying, fall back to the base amount.
  assert.deepEqual(pickClaimAmount({ ...base, bonusEligible: true, faucetBalanceTokens: 2_050_000 }), { amount: 6969, bonus: false });
  // Streak multiplier still applies to normal claims.
  assert.deepEqual(pickClaimAmount({ ...base, multiplier: 1.5, bonusEligible: false, faucetBalanceTokens: 39_800_000 }), { amount: 10454, bonus: false });
  // 39.8M balance covers ~378 bonus claims before the 2M floor.
  assert.equal(Math.floor((39_800_000 - LISTEN_MIN_FAUCET_BALANCE) / LISTEN_BONUS_AMOUNT), 378);
});

test("listenIdentity keys on fid, or the Base address on the web", () => {
  assert.equal(listenIdentity({ fid: 42 }), "fid:42");
  assert.equal(listenIdentity({ address: "0xAbC" }), "web:0xabc");
  assert.equal(listenIdentity({}), null);
});

async function db(): Promise<ListenSql> {
  const pg = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(dir, f), "utf8"));
  }
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    const res = await pg.query(text, values);
    return res.rows;
  }) as ListenSql;
  return sql;
}

test("server flow: early finish rejected, valid finish accepted, bonus used once", async () => {
  const sql = await db();
  const t0 = Date.parse("2026-10-18T15:00:00Z");
  const who = "fid:777";

  const s1 = await startListen(sql, who, "local", t0);
  assert.equal(s1.ok, true);
  if (!s1.ok) return;

  const early = await finishListen(sql, { sessionId: s1.sessionId, identity: who, playedSeconds: SONG }, t0 + 10_000);
  assert.equal(early.ok, false, "finishing after 10s must be rejected");
  assert.equal(await findBonusListen(sql, who, t0 + 10_000), null);

  const wrongIdentity = await finishListen(sql, { sessionId: s1.sessionId, identity: "fid:1" }, t0 + SONG * 1000);
  assert.equal(wrongIdentity.ok, false, "another identity can't finish my session");

  const ok = await finishListen(sql, { sessionId: s1.sessionId, identity: who, playedSeconds: SONG }, t0 + SONG * 1000);
  assert.equal(ok.ok, true);
  const listenId = await findBonusListen(sql, who, t0 + SONG * 1000);
  assert.ok(listenId, "completed listen is available for today's claim");
  assert.deepEqual((await listenStatus(sql, who, t0 + SONG * 1000)).unlocked, true);

  assert.equal(await claimBonusListen(sql, listenId!, 1), true);
  assert.equal(await claimBonusListen(sql, listenId!, 2), false, "a listen boosts only one claim");
  assert.equal(await findBonusListen(sql, who, t0 + SONG * 1000), null);

  // Next UTC day: yesterday's listen doesn't count.
  assert.equal(await findBonusListen(sql, who, t0 + 86_400_000), null);
});

test("one listen session at a time per identity", async () => {
  const sql = await db();
  const t0 = Date.parse("2026-10-18T15:00:00Z");
  const who = "web:0xabc";
  const a = await startListen(sql, who, "local", t0);
  const b = await startListen(sql, who, "local", t0 + 1000);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  // The older session was abandoned, so it can't be finished any more.
  const oldFinish = await finishListen(sql, { sessionId: a.sessionId, identity: who }, t0 + SONG * 1000 + 5000);
  assert.equal(oldFinish.ok, false);
  const active = await sql<{ n: number }>`select count(*)::int as n from listen_sessions where identity = ${who} and status = 'started'`;
  assert.equal(Number(active[0].n), 1);
});
