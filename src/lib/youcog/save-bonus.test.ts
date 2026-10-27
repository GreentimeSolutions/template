import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { classify, groupByAddress, holdsEnough, parseSince, saveBonusAmount } from "./save-bonus-core";
import { claimSaveBonus, saveBonusStatus, type SaveBonusDeps, type SaveSql } from "./save-bonus.server";

const DAY = 86_400_000;
const WEI = 10n ** 18n;
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const FAUCET = "0x3067ab541253746AB353b842Fdc0970ffBDe13c7";
const T0 = Date.parse("2026-11-01T12:00:00Z");

test("bonus is 10% of the claim, rounded down", () => {
  assert.equal(saveBonusAmount(840), 84);
  assert.equal(saveBonusAmount(2222), 222);
  assert.equal(saveBonusAmount(13938), 1393);
  assert.equal(saveBonusAmount(20907), 2090);
  assert.equal(saveBonusAmount(100_000), 10_000);
  assert.equal(saveBonusAmount(0), 0);
});

test("off unless SAVE_BONUS_SINCE is a valid time", () => {
  assert.equal(parseSince(undefined), null);
  assert.equal(parseSince(" "), null);
  assert.equal(parseSince("nope"), null);
  assert.equal(parseSince("2026-11-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z"));
});

test("classify: waits 7 days, then a 30-day window; claims before SINCE never count", () => {
  const c = (id: number, createdMs: number) => ({ id, address: A, fid: 1, amount: 2222, createdMs });
  const now = T0 + 10 * DAY;
  const r = classify([c(1, T0), c(2, T0 + 5 * DAY), c(3, T0 - 40 * DAY), c(4, T0 - DAY)], now, T0 - 50 * DAY);
  assert.deepEqual(r.ready.map((x) => x.id), [4, 1]);
  assert.deepEqual(r.waiting.map((x) => x.id), [2]);
  assert.deepEqual(r.expired.map((x) => x.id), [3]);
  const gated = classify([c(1, T0), c(4, T0 - DAY)], now, T0);
  assert.deepEqual(gated.ready.map((x) => x.id), [1]);
});

test("hold check needs balance >= total claimed being settled for that address", () => {
  const g = groupByAddress([
    { id: 1, address: A, fid: 1, amount: 2222, createdMs: 0 },
    { id: 2, address: A.toUpperCase().replace("0X", "0x"), fid: 1, amount: 840, createdMs: 0 },
    { id: 3, address: B, fid: 1, amount: 13938, createdMs: 0 },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].required, 3062);
  assert.equal(g[0].bonus, 306);
  assert.equal(holdsEnough(3062n * WEI, 3062), true);
  assert.equal(holdsEnough(3062n * WEI - 1n, 3062), false);
});

async function db(): Promise<SaveSql> {
  const pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(join(dir, f), "utf8"));
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  }) as SaveSql;
}

async function addClaim(sql: SaveSql, o: { address: string; fid: number | null; amount: number; atMs: number; status?: string }) {
  const day = new Date(o.atMs).toISOString().slice(0, 10);
  const rows = await sql<{ id: number }>`
    insert into faucet_claims (day, address, ip_hash, amount, fid, status, created_at)
    values (${day}, ${o.address}, ${`test:${Math.random()}`}, ${o.amount}, ${o.fid}, ${o.status ?? "sent"}, ${new Date(o.atMs).toISOString()})
    returning id`;
  return Number(rows[0].id);
}

function deps(sql: SaveSql, over: Partial<SaveBonusDeps> & { balances?: Record<string, bigint> } = {}) {
  const sends: { to: string; wei: bigint }[] = [];
  const d: SaveBonusDeps = {
    sql,
    sinceMs: T0 - DAY,
    nowMs: T0 + 8 * DAY,
    faucetAddress: FAUCET,
    dailyTokenBudget: 500_000,
    minFaucetTokens: 2_000_000,
    minGasWei: 1n,
    balanceOf: async (a) => over.balances?.[a.toLowerCase()] ?? 0n,
    faucetBalances: async () => ({ eth: 10n ** 15n, tokens: 100_000_000n * WEI }),
    send: async (to, wei) => {
      sends.push({ to, wei });
      return `0x${String(sends.length).padStart(64, "0")}`;
    },
    ...over,
  };
  return { d, sends };
}

test("pays 10% once per claim when the wallet still holds it; second tap pays nothing", async () => {
  const sql = await db();
  const id = await addClaim(sql, { address: A, fid: 7, amount: 13938, atMs: T0 });
  await addClaim(sql, { address: A, fid: 7, amount: 2222, atMs: T0 + 3 * DAY }); // not 7 days yet
  await addClaim(sql, { address: A, fid: 7, amount: 840, atMs: T0 + DAY, status: "failed" }); // never sent
  const { d, sends } = deps(sql, { balances: { [A.toLowerCase()]: 20_000n * WEI } });

  const st = await saveBonusStatus(d, { fid: 7 });
  assert.equal(st.open && st.ready, 1);
  assert.equal(st.open && st.readyBonus, 1393);

  const r = await claimSaveBonus(d, { fid: 7 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.total, 1393);
  assert.deepEqual(sends, [{ to: A, wei: 1393n * WEI }]);
  const [row] = await sql<{ claim_id: number; status: string; balance_wei: string }>`select claim_id, status, balance_wei from save_bonuses`;
  assert.equal(row.claim_id, id);
  assert.equal(row.status, "sent");
  assert.equal(row.balance_wei, (20_000n * WEI).toString());
  const [day] = await sql<{ tokens: number; claims: number }>`select tokens, claims from faucet_days`;
  assert.equal(Number(day.tokens), 1393, "counts toward the daily token budget");
  assert.equal(Number(day.claims), 0, "does not use a daily claim slot");

  const again = await claimSaveBonus(d, { fid: 7 });
  assert.equal(again.ok, false);
  assert.equal(sends.length, 1, "never pays the same claim twice");

  // Web lookup by address sees the same claim as already paid.
  const web = await claimSaveBonus(d, { address: A });
  assert.equal(web.ok, false);
  assert.equal(sends.length, 1);
});

test("refuses when the wallet holds less than it claimed, and nothing is reserved", async () => {
  const sql = await db();
  await addClaim(sql, { address: A, fid: 8, amount: 13938, atMs: T0 });
  const { d, sends } = deps(sql, { balances: { [A.toLowerCase()]: 13937n * WEI } });
  const r = await claimSaveBonus(d, { fid: 8 });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /less than the 13,938/);
  assert.equal(sends.length, 0);
  assert.equal((await sql`select 1 from save_bonuses`).length, 0);
});

test("respects the daily budget and the faucet floor; a failed send frees the claim", async () => {
  const sql = await db();
  await addClaim(sql, { address: A, fid: 9, amount: 100_000, atMs: T0 });
  const bal = { [A.toLowerCase()]: 1_000_000n * WEI };

  const full = deps(sql, { balances: bal, dailyTokenBudget: 5_000 });
  const r1 = await claimSaveBonus(full.d, { fid: 9 });
  assert.equal(r1.ok, false);
  assert.match(!r1.ok ? r1.reason : "", /budget/);

  const low = deps(sql, { balances: bal, faucetBalances: async () => ({ eth: 1n, tokens: 2_005_000n * WEI }) });
  const r2 = await claimSaveBonus(low.d, { fid: 9 });
  assert.equal(r2.ok, false);
  assert.match(!r2.ok ? r2.reason : "", /running low/);

  const boom = deps(sql, {
    balances: bal,
    send: async () => {
      throw new Error("rpc down");
    },
  });
  const r3 = await claimSaveBonus(boom.d, { fid: 9 });
  assert.equal(r3.ok, false);
  const [day] = await sql<{ tokens: number }>`select tokens from faucet_days`;
  assert.equal(Number(day.tokens), 0, "budget released after a failed send");

  const ok = deps(sql, { balances: bal });
  const r4 = await claimSaveBonus(ok.d, { fid: 9 });
  assert.equal(r4.ok && r4.total, 10_000);
});

test("closed when SAVE_BONUS_SINCE is unset; expired and pre-launch claims are ignored", async () => {
  const sql = await db();
  await addClaim(sql, { address: A, fid: 10, amount: 2222, atMs: T0 - 3 * DAY }); // before SINCE
  await addClaim(sql, { address: B, fid: 10, amount: 2222, atMs: T0 });
  const closed = deps(sql, { sinceMs: null });
  assert.deepEqual(await saveBonusStatus(closed.d, { fid: 10 }), { open: false });
  assert.equal((await claimSaveBonus(closed.d, { fid: 10 })).ok, false);

  const late = deps(sql, { nowMs: T0 + 38 * DAY, balances: { [B.toLowerCase()]: 10n ** 30n } });
  assert.equal((await claimSaveBonus(late.d, { fid: 10 })).ok, false, "window closed after 30 days");

  const ok = deps(sql, { balances: { [A.toLowerCase()]: 10n ** 30n, [B.toLowerCase()]: 10n ** 30n } });
  const r = await claimSaveBonus(ok.d, { fid: 10 });
  assert.equal(r.ok && r.total, 222);
  assert.deepEqual(ok.sends.map((s) => s.to), [B]);
});

test("pays only the wallets that still hold; skips the faucet's own address", async () => {
  const sql = await db();
  await addClaim(sql, { address: A, fid: 11, amount: 2222, atMs: T0 });
  await addClaim(sql, { address: B, fid: 11, amount: 840, atMs: T0 - 13 * 3600_000 });
  await addClaim(sql, { address: FAUCET, fid: 11, amount: 840, atMs: T0 + 13 * 3600_000 });
  const { d, sends } = deps(sql, { balances: { [A.toLowerCase()]: 5_000n * WEI, [FAUCET.toLowerCase()]: 10n ** 30n } });
  const r = await claimSaveBonus(d, { fid: 11 });
  assert.equal(r.ok, true);
  assert.deepEqual(sends.map((s) => s.to), [A]);
  assert.equal(r.ok && r.skipped.length, 1);
});

test("two taps at once pay a claim only once", async () => {
  const sql = await db();
  await addClaim(sql, { address: A, fid: 12, amount: 13938, atMs: T0 });
  const { d, sends } = deps(sql, { balances: { [A.toLowerCase()]: 10n ** 30n } });
  const [r1, r2] = await Promise.all([claimSaveBonus(d, { fid: 12 }), claimSaveBonus(d, { address: A })]);
  assert.equal([r1, r2].filter((r) => r.ok).length, 1);
  assert.equal(sends.length, 1);
});
