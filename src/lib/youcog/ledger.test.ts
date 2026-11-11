import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anchorCalldata,
  commitHex,
  ledgerHashHex,
  parseAnchorCalldata,
  payloadIsRedacted,
  receiptHasTransfer,
  TRANSFER_TOPIC,
  verifyChain,
  ZERO_HASH,
  type LedgerEvent,
} from "./ledger-core.ts";
import { ledgerExport, ledgerHead, ledgerSelfCheck, runLedgerAnchor } from "./ledger.server.ts";
import { persistTip, sendAnonTip, type AnonTipsDeps, type AnonTipsSql } from "./anon-tips.server.ts";
import { testDb } from "./test-db.ts";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

async function seed(sql: AnonTipsSql) {
  // Mirrors production today: 3 sent tips, 3 points rows, 3 balance credits.
  for (let i = 0; i < 3; i++) {
    await sql`insert into tip_balance_adjustments (fid, amount, note, created_at)
      values (209707, 220000, ${`admin test credit ${i}`}, ${`2026-11-10T0${i}:00:00Z`}::timestamptz)`;
    await persistTip(sql, {
      senderFid: 209707,
      recipientFid: 100 + i,
      recipientUsername: `user${i}`,
      recipientAddress: B,
      amount: 215225,
      giftPoints: 2152,
      status: "sent",
      txHash: `0x${String(i + 1).padStart(64, "a")}`,
      castHash: null,
      createdAt: `2026-11-10T0${i}:30:00Z`,
    });
  }
}

async function events(sql: AnonTipsSql): Promise<LedgerEvent[]> {
  return ledgerExport(sql, 0, 1000);
}

test("ledger is off by default: source writes append nothing", async () => {
  const { sql } = await testDb();
  await seed(sql);
  assert.equal((await events(sql)).length, 0);
  const h = await ledgerHead(sql);
  assert.equal(h.on, false);
  assert.equal(h.headSeq, null);
});

test("enable backfills genesis + existing rows in time order (10 events), JS hash == SQL hash", async () => {
  const { sql } = await testDb();
  await seed(sql);
  const [{ head }] = await sql<{ head: number }>`select ledger_enable() as head`;
  assert.equal(head, 9);
  const ev = await events(sql);
  assert.equal(ev.length, 10);
  assert.equal(ev[0].event_type, "genesis");
  assert.equal(ev[0].prev_hash, ZERO_HASH);
  assert.deepEqual(
    ev.slice(1).map((e) => e.event_type),
    ["balance.adjust", "tip.created", "points.created", "balance.adjust", "tip.created", "points.created", "balance.adjust", "tip.created", "points.created"],
  );
  for (const e of ev) assert.equal(ledgerHashHex(e.seq, e.event_type, e.payload, e.prev_hash), e.hash);
  const check = verifyChain(ev);
  assert.equal(check.ok, true);
  // Idempotent.
  const [{ head: again }] = await sql<{ head: number }>`select ledger_enable() as head`;
  assert.equal(again, 9);
  assert.equal((await ledgerHead(sql)).on, true);
});

test("after enable, a tip appends tip.created + points.created; status change appends tip.status", async () => {
  const { sql } = await testDb();
  await sql`select ledger_enable()`;
  await sql`insert into faucet_claims (day, address, ip_hash, amount, fid, status) values ('2026-11-08', ${A}, 'x', 5000, 7, 'sent')`;
  const d: AnonTipsDeps = {
    sql,
    live: false,
    persistDryRun: true,
    config: { min: 100, max: 1000, dailyCountCap: 5, dailyAmountCap: 5000, pointsPerHundred: 1, suggested: [100] },
    lookupUser: async () => ({ fid: 99, username: "nick" }),
    addressesFor: async (fid) => (fid === 7 ? [A] : [B]),
    sendYoucog: async () => {
      throw new Error("never");
    },
    postCast: async () => null,
  };
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(r.ok, true);
  let ev = await events(sql);
  assert.deepEqual(ev.map((e) => e.event_type).sort(), ["genesis", "points.created", "tip.created"]);
  await sql`update anon_tips set status = 'held', review_state = 'held'`;
  ev = await events(sql);
  assert.equal(ev[ev.length - 1].event_type, "tip.status");
  assert.equal(verifyChain(ev).ok, true);
  // Sender fid never appears; commitment opens with the private salt.
  const tipEv = ev.find((e) => e.event_type === "tip.created")!;
  assert.equal(payloadIsRedacted(tipEv.payload), true);
  assert.equal(tipEv.payload.includes('"sender_fid"'), false);
  const [{ s }] = await sql<{ s: string }>`select encode(salt, 'hex') as s from ledger_salts where seq = ${tipEv.seq}`;
  assert.equal(JSON.parse(tipEv.payload).sender_commit, commitHex(s, 7));
  assert.notEqual(JSON.parse(tipEv.payload).sender_commit, commitHex(s, 8));
});

test("ledger rows are append-only; source rows are locked while on", async () => {
  const { sql } = await testDb();
  await seed(sql);
  await sql`select ledger_enable()`;
  const blocked = async (q: Promise<unknown>) => {
    await assert.rejects(q, /append-only|permanent|only status|only state/);
  };
  await blocked(sql`update ledger_events set payload = '{}' where seq = 1`);
  await blocked(sql`delete from ledger_events where seq = 9`);
  await blocked(sql`update ledger_salts set salt = '\\x00'`);
  await blocked(sql`delete from anon_tips`);
  await blocked(sql`update anon_tips set amount = 1`);
  await blocked(sql`update anon_tips set recipient_address = ${A}`);
  await blocked(sql`delete from gift_points_ledger`);
  await blocked(sql`update gift_points_ledger set points = 999999`);
  await blocked(sql`update tip_balance_adjustments set amount = 999999999`);
  await blocked(sql`delete from tip_balance_adjustments`);
  // Allowed: status changes (each one chained).
  await sql`update anon_tips set cast_hash = '0xabc' where id = 1`;
  assert.equal((await events(sql)).at(-1)?.event_type, "tip.status");
});

test("verifier pinpoints tampering, reordering and gaps", async () => {
  const { sql } = await testDb();
  await seed(sql);
  await sql`select ledger_enable()`;
  const ev = await events(sql);
  const tampered = ev.map((e) => ({ ...e }));
  tampered[4].payload = tampered[4].payload.replace('"amount" : ', '"amount" : 1');
  const t = verifyChain(tampered);
  assert.equal(t.ok, false);
  if (!t.ok) assert.equal(t.badSeq, 4);
  const swapped = [...ev];
  [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  assert.equal(verifyChain(swapped).ok, false);
  const gap = ev.filter((e) => e.seq !== 5);
  const g = verifyChain(gap);
  assert.equal(g.ok, false);
  if (!g.ok) assert.equal(g.badSeq, 6);
  // Continue from a known-good point.
  assert.equal(verifyChain(ev.slice(5), { seq: ev[4].seq, hash: ev[4].hash }).ok, true);
  assert.equal((await ledgerSelfCheck(sql)).ok, true);
});

test("50 concurrent inserts produce a gapless, fork-free chain", async () => {
  const { sql } = await testDb();
  await sql`select ledger_enable()`;
  await Promise.all(
    Array.from({ length: 50 }, (_, i) => sql`insert into tip_balance_adjustments (fid, amount, note) values (${i + 1}, 1, 'c')`),
  );
  const ev = await events(sql);
  assert.equal(ev.length, 51);
  assert.equal(verifyChain(ev).ok, true);
  assert.equal(new Set(ev.map((e) => e.prev_hash)).size, 51);
});

test("persistTip is atomic: a failure midway leaves no tip, ledger row or event", async () => {
  const { sql, pg } = await testDb();
  await sql`select ledger_enable()`;
  await pg.exec(`create function boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
    create trigger boom before insert on gift_points for each row execute function boom();`);
  await assert.rejects(
    persistTip(sql, {
      senderFid: 7, recipientFid: 99, recipientUsername: "nick", recipientAddress: B,
      amount: 100, giftPoints: 1, status: "sent", txHash: null, castHash: null, createdAt: new Date().toISOString(),
    }),
    /boom/,
  );
  assert.equal((await sql`select id from anon_tips`).length, 0);
  assert.equal((await sql`select id from gift_points_ledger`).length, 0);
  assert.equal((await events(sql)).length, 1);
});

test("anchor calldata round-trips; cron is off by default and dry-run never records or sends", async () => {
  const h = "ab".repeat(32);
  const data = anchorCalldata(9, h, "0xdeadbeef");
  assert.match(data, /^0x59434f474c454447455231/);
  assert.deepEqual(parseAnchorCalldata(data), { seq: 9, headHash: h });
  assert.equal(parseAnchorCalldata("0x1234"), null);
  assert.throws(() => anchorCalldata(-1, h));
  const { sql } = await testDb();
  await seed(sql);
  await sql`select ledger_enable()`;
  const off = await runLedgerAnchor({ sql, enabled: false, dryRun: true, dataSuffix: "" });
  assert.equal(off.ok, false);
  let sent = 0;
  const dry = await runLedgerAnchor({ sql, enabled: true, dryRun: true, dataSuffix: "", sendAnchorTx: async () => { sent++; return "0x1"; } });
  assert.equal(dry.ok && "dryRun" in dry && dry.dryRun, true);
  assert.equal(sent, 0);
  assert.equal((await sql`select id from ledger_anchors`).length, 0);
});

test("on-chain transfer matcher checks token, from, to and exact amount", () => {
  const token = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";
  const from = "0x3067ab541253746ab353b842fdc0970ffbde13c7";
  const pad = (a: string) => `0x${"0".repeat(24)}${a.slice(2).toLowerCase()}`;
  const amountWei = 215225n * 10n ** 18n;
  const receipt = {
    status: "0x1",
    logs: [{ address: token.toLowerCase(), topics: [TRANSFER_TOPIC, pad(from), pad(B)], data: `0x${amountWei.toString(16).padStart(64, "0")}` }],
  };
  assert.equal(receiptHasTransfer(receipt, { token, from, to: B, amountWei }), true);
  assert.equal(receiptHasTransfer(receipt, { token, from, to: A, amountWei }), false);
  assert.equal(receiptHasTransfer(receipt, { token, from, to: B, amountWei: amountWei + 1n }), false);
  assert.equal(receiptHasTransfer({ ...receipt, status: "0x0" }, { token, from, to: B, amountWei }), false);
});
