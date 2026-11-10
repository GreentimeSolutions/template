import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  availableBalance,
  checkTipGate,
  composeCastText,
  envFlag,
  giftPointsFor,
  mentionCount,
  normalizeUsername,
  parseTipAmount,
  readAnonTipsConfig,
  redeemGiftPointsStub,
  REDEMPTION_STUB_REASON,
  tipAmountsFromClaim,
  tipsLive,
  DEFAULT_ANON_TIPS_CONFIG,
  type AnonTipsConfig,
} from "./anon-tips-core.ts";
import { anonTipsStatus, sendAnonTip, setTipOptOut, type AnonTipsDeps, type AnonTipsSql } from "./anon-tips.server.ts";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const T0 = Date.parse("2026-11-09T18:00:00Z");
const SMALL: AnonTipsConfig = {
  min: 100,
  max: 10_000,
  dailyCountCap: 5,
  dailyAmountCap: 20_000,
  pointsPerHundred: 1,
  suggested: [100, 500, 1_000],
};


test("username normalizes, strips @, and rejects junk", () => {
  assert.equal(normalizeUsername("@Nick"), "nick");
  assert.equal(normalizeUsername("  greentime1 "), "greentime1");
  assert.equal(normalizeUsername("@@youcog-tips"), "youcog-tips");
  assert.equal(normalizeUsername(""), null);
  assert.equal(normalizeUsername("has space"), null);
  assert.equal(normalizeUsername("bad!"), null);
  assert.equal(normalizeUsername("thisusernameiswaytoolong"), null);
});

test("amounts must be whole YOUCOG between the configured min and max", () => {
  assert.equal(parseTipAmount(100, SMALL), 100);
  assert.equal(parseTipAmount("500", SMALL), 500);
  assert.equal(parseTipAmount(10_000, SMALL), 10_000);
  assert.equal(parseTipAmount(99, SMALL), null);
  assert.equal(parseTipAmount(10_001, SMALL), null);
  assert.equal(parseTipAmount(150.5, SMALL), null);
  assert.equal(parseTipAmount("nope", SMALL), null);
  assert.equal(parseTipAmount(220_000), 220_000);
  assert.equal(parseTipAmount(100), null);
});

test("gift points default to 1 per 100 YOUCOG and the rate is configurable", () => {
  assert.equal(giftPointsFor(100), 1);
  assert.equal(giftPointsFor(500), 5);
  assert.equal(giftPointsFor(1_000), 10);
  assert.equal(giftPointsFor(999), 9);
  assert.equal(giftPointsFor(1_000, 2), 20);
  assert.equal(giftPointsFor(0), 0);
});

test("default tip sizes are 1, 2 and 5 times the claim amount", () => {
  assert.deepEqual(DEFAULT_ANON_TIPS_CONFIG.suggested, [220_000, 440_000, 1_100_000]);
  assert.deepEqual(tipAmountsFromClaim(215_225).suggested, [215_225, 430_450, 1_076_125]);
  assert.equal(tipAmountsFromClaim(215_225).min, 215_225);
  assert.equal(tipAmountsFromClaim(215_225).max, 1_076_125);
});

test("available balance is earned claims minus tips already sent", () => {
  assert.equal(availableBalance(840, 100), 740);
  assert.equal(availableBalance(840, 840), 0);
  assert.equal(availableBalance(840, 900), 0);
  assert.equal(availableBalance(0, 0), 0);
});

test("cast text has exactly one @mention and never names the sender", () => {
  const text = composeCastText(100, "@Nick");
  assert.equal(text, "100👻 @nick — anonymous tip via Youcognito");
  assert.equal(mentionCount(text), 1);
  assert.equal(text.includes("greentime"), false);
  assert.equal(text.toLowerCase().includes("sender"), false);
});

test("env flags are off unless explicitly enabled", () => {
  assert.equal(envFlag(undefined), false);
  assert.equal(envFlag(""), false);
  assert.equal(envFlag("false"), false);
  assert.equal(tipsLive(undefined), false);
  assert.equal(tipsLive("0"), false);
  assert.equal(tipsLive("true"), true);
  assert.equal(tipsLive("1"), true);
  assert.equal(readAnonTipsConfig({ GIFT_POINTS_PER_100: "3" }).pointsPerHundred, 3);
});

test("daily caps cover both count and amount", () => {
  const base = { amount: 100, available: 10_000, todayCount: 0, todayAmount: 0, config: SMALL };
  assert.equal(checkTipGate(base).ok, true);
  assert.equal(checkTipGate({ ...base, todayCount: 5 }).ok, false);
  assert.equal(checkTipGate({ ...base, todayAmount: 19_950, amount: 100 }).ok, false);
  assert.equal(checkTipGate({ ...base, todayAmount: 19_900, amount: 100 }).ok, true);
  assert.equal(checkTipGate({ ...base, amount: 200, available: 150 }).ok, false);
  assert.equal(checkTipGate({ ...base, selfTip: true }).ok, false);
  assert.equal(checkTipGate({ ...base, optedOut: true }).ok, false);
  assert.equal(checkTipGate({ ...base, hasVerifiedAddress: false }).ok, false);
});

test("redemption is a stub that promises nothing", () => {
  assert.deepEqual(redeemGiftPointsStub(), { ok: false, reason: REDEMPTION_STUB_REASON });
  assert.match(REDEMPTION_STUB_REASON, /announced separately/i);
  assert.equal(/worth|profit|value|payout|vest/i.test(REDEMPTION_STUB_REASON), false);
});

async function db(): Promise<AnonTipsSql> {
  const pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(dir, f), "utf8"));
  }
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  }) as AnonTipsSql;
}

async function addClaim(sql: AnonTipsSql, o: { fid: number | null; address: string; amount: number; status?: string; day?: string }) {
  await sql`
    insert into faucet_claims (day, address, ip_hash, amount, fid, status)
    values (${o.day ?? "2026-11-08"}, ${o.address}, ${`test:${Math.random()}`}, ${o.amount}, ${o.fid}, ${o.status ?? "sent"})`;
}

function deps(sql: AnonTipsSql, over: Partial<AnonTipsDeps> = {}) {
  const sends: { to: string; wei: bigint }[] = [];
  const casts: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const users = new Map<string, { fid: number; username: string }>([
    ["nick", { fid: 99, username: "nick" }],
    ["greentime1", { fid: 209707, username: "greentime1" }],
  ]);
  const addrs = new Map<number, string[]>([
    [99, [B]],
    [7, [A]],
    [209707, [A]],
  ]);
  const d: AnonTipsDeps = {
    sql,
    live: false,
    persistDryRun: true,
    config: SMALL,
    nowMs: T0,
    lookupUser: async (u) => users.get(u) ?? null,
    addressesFor: async (fid) => addrs.get(fid) ?? [],
    sendYoucog: async (to, wei) => {
      sends.push({ to, wei });
      return `0x${String(sends.length).padStart(64, "0")}`;
    },
    postCast: async (text) => {
      casts.push(text);
      return `0xcast${casts.length}`;
    },
    log: (_m, extra) => {
      if (extra) logs.push(extra);
    },
    ...over,
  };
  return { d, sends, casts, logs, users, addrs };
}

test("balance math uses sent faucet claims minus tips already recorded", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 7, address: A, amount: 840, day: "2026-11-06" });
  await addClaim(sql, { fid: 7, address: A, amount: 2222, day: "2026-11-07" });
  await addClaim(sql, { fid: 7, address: A, amount: 500, status: "failed", day: "2026-11-07" });
  const { d } = deps(sql);
  const st = await anonTipsStatus(d, 7);
  assert.equal(st.earned, 3062);
  assert.equal(st.available, 3062);
  assert.equal(st.tipped, 0);

  const tip = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 500 });
  assert.equal(tip.ok, true);
  const after = await anonTipsStatus(d, 7);
  assert.equal(after.tipped, 500);
  assert.equal(after.available, 2562);
  assert.equal(after.giftPoints, 5);
  assert.equal(after.tipCount, 1);
});

test("web-only claims on a verified address count toward that FID's balance", async () => {
  const sql = await db();
  await addClaim(sql, { fid: null, address: A, amount: 13938 });
  const { d } = deps(sql);
  const st = await anonTipsStatus(d, 7);
  assert.equal(st.earned, 13938);
  assert.equal(st.available, 13938);
});

test("opt-out blocks receiving but the sender can still tip others", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const { d } = deps(sql);
  const out = await setTipOptOut(d, 99, true);
  assert.equal(out.ok && out.optedOut, true);
  const blocked = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.reason, /opted out/i);
  const back = await setTipOptOut(d, 99, false);
  assert.equal(back.ok && back.optedOut, false);
  const ok = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(ok.ok, true);
});

test("dry-run logs the transfer and cast text and never sends or posts", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const { d, sends, casts, logs } = deps(sql, { live: false, persistDryRun: true });
  const r = await sendAnonTip(d, { senderFid: 7, username: "@Nick", amount: 100 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.dryRun, true);
  assert.equal(r.amount, 100);
  assert.equal(r.giftPoints, 1);
  assert.equal(r.recipientAddress, B);
  assert.equal(r.castText, "100👻 @nick — anonymous tip via Youcognito");
  assert.equal(r.txHash, null);
  assert.deepEqual(sends, []);
  assert.deepEqual(casts, []);
  assert.equal(logs[0]?.castText, r.castText);
  assert.equal(logs[0]?.to, B);
  assert.equal(logs[0]?.amount, 100);
  const [row] = await sql<{ status: string; tx_hash: string | null }>`select status, tx_hash from anon_tips`;
  assert.equal(row.status, "dry_run");
  assert.equal(row.tx_hash, null);
});

test("dry-run without persist writes nothing and still sends nothing", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const { d, sends, casts } = deps(sql, { live: false, persistDryRun: false });
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(r.ok && r.dryRun, true);
  assert.deepEqual(sends, []);
  assert.deepEqual(casts, []);
  const rows = await sql`select id from anon_tips`;
  assert.equal(rows.length, 0);
});

test("self-tips and unknown users are refused", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 209707, address: A, amount: 5000 });
  const { d } = deps(sql);
  const self = await sendAnonTip(d, { senderFid: 209707, username: "greentime1", amount: 100 });
  assert.equal(self.ok, false);
  if (!self.ok) assert.match(self.reason, /yourself/i);
  const missing = await sendAnonTip(d, { senderFid: 209707, username: "nope-nope", amount: 100 });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.reason, /couldn't find/i);
});

test("daily count cap is enforced after recorded tips", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 7, address: A, amount: 20_000 });
  const { d } = deps(sql);
  for (let i = 0; i < 5; i++) {
    const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
    assert.equal(r.ok, true);
  }
  const sixth = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(sixth.ok, false);
  if (!sixth.ok) assert.match(sixth.reason, /count limit/i);
});

test("live path calls send and cast once and records gift points", async () => {
  const sql = await db();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const { d, sends, casts } = deps(sql, { live: true });
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 1_000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.dryRun, false);
  assert.equal(r.giftPoints, 10);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, B);
  assert.equal(sends[0].wei, 1000n * 10n ** 18n);
  assert.deepEqual(casts, ["1000👻 @nick — anonymous tip via Youcognito"]);
  const [gp] = await sql<{ points: number; tipped_amount: number; tip_count: number }>`select points, tipped_amount, tip_count from gift_points where fid = 7`;
  assert.equal(Number(gp.points), 10);
  assert.equal(Number(gp.tipped_amount), 1000);
  assert.equal(Number(gp.tip_count), 1);
});
