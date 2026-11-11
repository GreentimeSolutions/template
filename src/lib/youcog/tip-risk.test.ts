import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIP_RISK_CONFIG,
  evaluateTipRisk,
  isAdminFid,
  readTipRiskConfig,
  HELD_MESSAGE,
  DENY_WALLET_REASON,
  type FcProfile,
  type TipRiskConfig,
  type TipRiskInput,
} from "./tip-risk-core.ts";
import { anonTipsStatus, sendAnonTip, type AnonTipsDeps, type AnonTipsSql } from "./anon-tips.server.ts";
import { approveHeldTip, listReviewQueue, rejectHeldTip, sweepTipReviews, voidPendingPoints } from "./anon-tips-review.server.ts";
import { testDb } from "./test-db.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 86_400_000;
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

function prof(fid: number, over: Partial<FcProfile> = {}): FcProfile {
  return {
    fid,
    score: 0.95,
    registeredAt: new Date(NOW - 400 * DAY).toISOString(),
    followerCount: 500,
    followingCount: 300,
    custodyAddress: null,
    ethAddresses: [],
    primaryEth: null,
    ...over,
  };
}

const NO_HISTORY: TipRiskInput["history"] = {
  reciprocalCount: 0,
  pairRepeatCount: 0,
  recipientTodayCount: 0,
  recipientTodayAmount: 0,
  globalTodayCount: 0,
  globalTodayAmount: 0,
  senderLastHourCount: 0,
  payoutInSenderClaims: false,
  recipientWalletReuse: false,
  sharedIpHash: false,
};

function input(over: Partial<TipRiskInput> = {}, hist: Partial<TipRiskInput["history"]> = {}): TipRiskInput {
  return {
    nowMs: NOW,
    amount: 100,
    claimAmount: 100,
    senderFid: 7,
    recipientFid: 99,
    recipientPayout: B,
    sender: prof(7, { ethAddresses: [A] }),
    recipient: prof(99, { ethAddresses: [B] }),
    senderAddresses: [A],
    recipientAddresses: [B],
    history: { ...NO_HISTORY, ...hist },
    ...over,
  };
}

const ENFORCE: TipRiskConfig = { ...DEFAULT_TIP_RISK_CONFIG, mode: "enforce" };

test("config: off by default, TIPS_RISK_ON=1 means log-only, enforce must be explicit", () => {
  assert.equal(readTipRiskConfig({}).mode, "off");
  assert.equal(readTipRiskConfig({ TIPS_RISK_ON: "1" }).mode, "log");
  assert.equal(readTipRiskConfig({ TIPS_RISK_MODE: "log" }).mode, "log");
  assert.equal(readTipRiskConfig({ TIPS_RISK_MODE: "enforce" }).mode, "enforce");
  assert.equal(readTipRiskConfig({ TIPS_RISK_MODE: "bogus" }).mode, "off");
  const d = readTipRiskConfig({});
  assert.equal(d.minScore, 0.55);
  assert.equal(d.softScore, 0.7);
  assert.equal(d.minAgeDays, 30);
  assert.equal(d.reciprocalDays, 14);
  assert.equal(d.pairRepeatDays, 7);
  assert.equal(d.recipientDailyCount, 3);
  assert.equal(d.globalDailyCount, 40);
  assert.deepEqual(d.adminFids, [209707]);
  assert.equal(readTipRiskConfig({ TIPS_RISK_MIN_SCORE: "0.6" }).minScore, 0.6);
  assert.equal(isAdminFid(209707), true);
  assert.equal(isAdminFid(99), false);
  assert.equal(isAdminFid(undefined), false);
});

test("clean tip between established accounts is allowed", () => {
  const r = evaluateTipRisk(input(), ENFORCE);
  assert.equal(r.outcome, "allow");
  assert.deepEqual(r.flags, []);
});

test("Andy's real profiles (Nov 11 scores) pass", () => {
  const andy = prof(209707, { score: 0.87, followerCount: 1200, followingCount: 900 });
  for (const [fid, score] of [[6810, 0.99], [4378, 1.0], [12345, 0.99]] as const) {
    const r = evaluateTipRisk(input({ senderFid: 209707, recipientFid: fid, sender: andy, recipient: prof(fid, { score }), senderAddresses: [A] }), ENFORCE);
    assert.equal(r.outcome, "allow", `recipient ${fid}`);
  }
});

test("deny: shared wallet (verified, custody, or payout) and payout in sender's claims", () => {
  let r = evaluateTipRisk(input({ recipientAddresses: [B, A] }), ENFORCE);
  assert.equal(r.outcome, "deny");
  assert.equal(r.reason, DENY_WALLET_REASON);
  assert.ok(r.flags.includes("D2_shared_wallet"));
  r = evaluateTipRisk(input({ recipient: prof(99, { custodyAddress: A }) }), ENFORCE);
  assert.equal(r.outcome, "deny");
  r = evaluateTipRisk(input({}, { payoutInSenderClaims: true }), ENFORCE);
  assert.equal(r.outcome, "deny");
  assert.ok(r.flags.includes("D3_payout_is_sender_claim_wallet"));
  r = evaluateTipRisk(input({ recipientFid: 7 }), ENFORCE);
  assert.equal(r.outcome, "deny");
  assert.match(r.reason ?? "", /yourself/);
});

test("score boundaries: <0.55 hold, 0.55–0.70 points hold, 0.70 allow", () => {
  assert.equal(evaluateTipRisk(input({ sender: prof(7, { score: 0.549 }) }), ENFORCE).outcome, "hold");
  assert.equal(evaluateTipRisk(input({ recipient: prof(99, { score: 0.549 }) }), ENFORCE).outcome, "hold");
  const soft = evaluateTipRisk(input({ sender: prof(7, { score: 0.55 }) }), ENFORCE);
  assert.equal(soft.outcome, "points_hold");
  assert.ok(soft.flags.includes("P1_sender_soft_score"));
  assert.equal(evaluateTipRisk(input({ sender: prof(7, { score: 0.699 }) }), ENFORCE).outcome, "points_hold");
  assert.equal(evaluateTipRisk(input({ sender: prof(7, { score: 0.7 }) }), ENFORCE).outcome, "allow");
  assert.equal(evaluateTipRisk(input({ sender: prof(7, { score: null }) }), ENFORCE).outcome, "hold");
});

test("account age boundary at 30 days", () => {
  const young = evaluateTipRisk(input({ recipient: prof(99, { registeredAt: new Date(NOW - 29 * DAY).toISOString() }) }), ENFORCE);
  assert.equal(young.outcome, "hold");
  assert.ok(young.flags.includes("H2_recipient_new_account"));
  assert.equal(evaluateTipRisk(input({ recipient: prof(99, { registeredAt: new Date(NOW - 30 * DAY).toISOString() }) }), ENFORCE).outcome, "allow");
});

test("missing Neynar data holds (fail safe, never deny)", () => {
  const r = evaluateTipRisk(input({ sender: null }), ENFORCE);
  assert.equal(r.outcome, "hold");
  assert.equal(r.reason, HELD_MESSAGE);
  assert.ok(r.flags.includes("H0_neynar_unavailable"));
});

test("history rules: reciprocity, wallet reuse, shared ip, pair repeat, recipient inflow, global cap", () => {
  const cases: [Partial<TipRiskInput["history"]>, string][] = [
    [{ reciprocalCount: 1 }, "H3_reciprocal"],
    [{ recipientWalletReuse: true }, "H4_wallet_reuse"],
    [{ sharedIpHash: true }, "H4_shared_ip"],
    [{ pairRepeatCount: 1 }, "H5_pair_repeat"],
    [{ recipientTodayCount: 3 }, "H6_recipient_inflow"],
    [{ recipientTodayAmount: 450 }, "H6_recipient_inflow"],
    [{ globalTodayCount: 40 }, "H7_global_cap"],
    [{ globalTodayAmount: 3_950 }, "H7_global_cap"],
  ];
  for (const [h, flag] of cases) {
    const r = evaluateTipRisk(input({}, h), ENFORCE);
    assert.equal(r.outcome, "hold", flag);
    assert.ok(r.flags.includes(flag), flag);
  }
  assert.equal(evaluateTipRisk(input({}, { recipientTodayCount: 2, recipientTodayAmount: 400 }), ENFORCE).outcome, "allow");
  assert.equal(evaluateTipRisk(input({}, { globalTodayCount: 39 }), ENFORCE).outcome, "allow");
});

test("points-only hold: low followers, follow ratio, burst", () => {
  assert.equal(evaluateTipRisk(input({ recipient: prof(99, { followerCount: 49, followingCount: 10 }) }), ENFORCE).outcome, "points_hold");
  assert.equal(evaluateTipRisk(input({ recipient: prof(99, { followerCount: 50, followingCount: 10 }) }), ENFORCE).outcome, "allow");
  assert.equal(evaluateTipRisk(input({ sender: prof(7, { followerCount: 60, followingCount: 1300 }) }), ENFORCE).outcome, "points_hold");
  const b = evaluateTipRisk(input({}, { senderLastHourCount: 3 }), ENFORCE);
  assert.equal(b.outcome, "points_hold");
  assert.ok(b.flags.includes("P3_burst"));
});

// ---------------------------------------------------------------------------
// Integration with PGlite

async function addClaim(sql: AnonTipsSql, o: { fid: number | null; address: string; amount: number; ip?: string; day?: string }) {
  await sql`insert into faucet_claims (day, address, ip_hash, amount, fid, status, created_at)
    values (${o.day ?? "2026-11-08"}, ${o.address}, ${o.ip ?? `test:${Math.random()}`}, ${o.amount}, ${o.fid}, 'sent', ${new Date(NOW - DAY).toISOString()}::timestamptz)`;
}

const SMALL = { min: 100, max: 10_000, dailyCountCap: 5, dailyAmountCap: 20_000, pointsPerHundred: 1, suggested: [100] };

function harness(sql: AnonTipsSql, mode: TipRiskConfig["mode"], profiles: Map<number, FcProfile | null>, over: Partial<AnonTipsDeps> = {}) {
  const sends: string[] = [];
  const casts: string[] = [];
  const neynarCalls: number[][] = [];
  const users = new Map([
    ["nick", { fid: 99, username: "nick" }],
    ["sam", { fid: 55, username: "sam" }],
    ["andy", { fid: 7, username: "andy" }],
  ]);
  const addrs = new Map<number, string[]>([
    [7, [A]],
    [99, [B]],
    [55, [C]],
  ]);
  const d: AnonTipsDeps = {
    sql,
    live: true,
    persistDryRun: true,
    config: SMALL,
    nowMs: NOW,
    lookupUser: async (u) => users.get(u) ?? null,
    addressesFor: async (fid) => addrs.get(fid) ?? [],
    sendYoucog: async (to) => {
      sends.push(to);
      return `0x${String(sends.length).padStart(64, "0")}`;
    },
    postCast: async (text) => {
      casts.push(text);
      return `0xcast${casts.length}`;
    },
    risk: {
      config: { ...DEFAULT_TIP_RISK_CONFIG, mode },
      fetchProfiles: async (fids) => {
        neynarCalls.push(fids);
        return fids.map((f) => profiles.get(f)).filter((p): p is FcProfile => Boolean(p));
      },
    },
    ...over,
  };
  return { d, sends, casts, neynarCalls, addrs };
}

const GOOD = () =>
  new Map<number, FcProfile | null>([
    [7, prof(7, { ethAddresses: [A] })],
    [99, prof(99, { ethAddresses: [B] })],
    [55, prof(55, { ethAddresses: [C] })],
  ]);

test("mode off makes no Neynar calls and behaves exactly as before", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const { d, sends, neynarCalls } = harness(sql, "off", GOOD());
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(r.ok, true);
  assert.equal(sends.length, 1);
  assert.equal(neynarCalls.length, 0);
});

test("log mode records flags but never blocks; Neynar cached for a day", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const p = GOOD();
  p.set(99, prof(99, { ethAddresses: [B], score: 0.3 }));
  const { d, sends, neynarCalls } = harness(sql, "log", p);
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.held, undefined);
  assert.equal(sends.length, 1);
  const [row] = await sql<{ status: string; risk_flags: string[]; review_state: string }>`select status, risk_flags, review_state from anon_tips`;
  assert.equal(row.status, "sent");
  assert.equal(row.review_state, "none");
  assert.ok(row.risk_flags.includes("H1_recipient_low_score"));
  const reviews = await sql<{ decision: string }>`select decision from tip_risk_reviews`;
  assert.deepEqual(reviews.map((x) => x.decision), ["shadow"]);
  // Second tip same day: pair repeat now flagged too, and profiles come from cache (no new call).
  await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(neynarCalls.length, 1);
  const flags = await sql<{ risk_flags: string[] }>`select risk_flags from anon_tips order by id desc limit 1`;
  assert.ok(flags[0].risk_flags.includes("H5_pair_repeat"));
  const st = await anonTipsStatus(d, 7);
  assert.equal(st.giftPoints, 2);
  assert.equal(st.pendingPoints, 0);
});

test("enforce deny: shared wallet is refused with the friendly message", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const p = GOOD();
  p.set(99, prof(99, { ethAddresses: [B, A] }));
  const { d, sends } = harness(sql, "enforce", p);
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, DENY_WALLET_REASON);
  assert.equal(sends.length, 0);
  assert.equal((await sql`select id from anon_tips`).length, 0);
});

test("enforce hold reserves balance, sends nothing; approve sends exactly once and credits points", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 1000 });
  const p = GOOD();
  p.set(99, prof(99, { ethAddresses: [B], registeredAt: new Date(NOW - 3 * DAY).toISOString() }));
  const { d, sends, casts } = harness(sql, "enforce", p);
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 600 });
  assert.equal(r.ok && r.held, true);
  assert.equal(sends.length, 0);
  assert.equal(casts.length, 0);
  let st = await anonTipsStatus(d, 7);
  assert.equal(st.available, 400);
  assert.equal(st.heldCount, 1);
  assert.equal(st.giftPoints, 0);
  assert.equal(st.pendingPoints, 6);
  assert.equal(st.recentTips[0].held, true);
  // Can't double-spend the reserved amount.
  const again = await sendAnonTip(d, { senderFid: 7, username: "sam", amount: 600 });
  assert.equal(again.ok, false);

  const q = await listReviewQueue(sql);
  assert.equal(q.held.length, 1);
  assert.equal("senderFid" in q.held[0], false);
  const id = q.held[0].id;
  const [a1, a2] = await Promise.all([approveHeldTip(d, id, 209707), approveHeldTip(d, id, 209707)]);
  assert.equal([a1.ok, a2.ok].filter(Boolean).length, 1);
  assert.equal(sends.length, 1);
  assert.equal(casts.length, 1);
  st = await anonTipsStatus(d, 7);
  assert.equal(st.heldCount, 0);
  assert.equal(st.available, 400);
  assert.equal(st.giftPoints, 6);
  assert.equal(st.pendingPoints, 0);
  const [row] = await sql<{ status: string; review_state: string; reviewed_by: string }>`select status, review_state, reviewed_by from anon_tips where id = ${id}`;
  assert.deepEqual({ ...row }, { status: "sent", review_state: "approved", reviewed_by: "admin:209707" });
  const decisions = (await sql<{ decision: string }>`select decision from tip_risk_reviews order by id`).map((x) => x.decision);
  assert.deepEqual(decisions, ["hold", "approve"]);
});

test("approve when not live records dry_run and sends nothing", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 1000 });
  const { d, sends } = harness(sql, "enforce", new Map([[7, prof(7)]]), { live: false });
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  assert.equal(r.ok && r.held, true);
  const [{ id }] = await sql<{ id: number }>`select id from anon_tips`;
  const a = await approveHeldTip(d, id, 209707);
  assert.equal(a.ok && a.status, "dry_run");
  assert.equal(sends.length, 0);
});

test("reject releases the reservation and voids points; expiry sweep does the same after 7 days", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 1000 });
  const { d } = harness(sql, "enforce", new Map()); // Neynar down -> hold
  await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 500 });
  await sendAnonTip(d, { senderFid: 7, username: "sam", amount: 500 });
  assert.equal((await anonTipsStatus(d, 7)).available, 0);
  const [t1, t2] = await sql<{ id: number }>`select id from anon_tips order by id`;
  const rj = await rejectHeldTip(sql, t1.id, 209707, "test");
  assert.equal(rj.ok, true);
  assert.equal((await rejectHeldTip(sql, t1.id, 209707)).ok, false);
  assert.equal((await anonTipsStatus(d, 7)).available, 500);
  const none = await sweepTipReviews(sql, NOW + 6 * DAY);
  assert.equal(none.expired, 0);
  const sw = await sweepTipReviews(sql, NOW + 8 * DAY);
  assert.equal(sw.expired, 1);
  const st = await anonTipsStatus(d, 7);
  assert.equal(st.available, 1000);
  assert.equal(st.pendingPoints, 0);
  const states = (await sql<{ state: string }>`select state from gift_points_ledger order by id`).map((x) => x.state);
  assert.deepEqual(states, ["void", "void"]);
  const [x] = await sql<{ status: string }>`select status from anon_tips where id = ${t2.id}`;
  assert.equal(x.status, "expired");
});

test("points-only hold: tip sends, points pending 7 days, then released by the sweep (or voided)", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  const p = GOOD();
  p.set(99, prof(99, { ethAddresses: [B], followerCount: 10, followingCount: 5 }));
  p.set(55, prof(55, { ethAddresses: [C], score: 0.6 }));
  const { d, sends } = harness(sql, "enforce", p);
  const r = await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 300 });
  assert.equal(r.ok && r.pointsPending, true);
  const r2 = await sendAnonTip(d, { senderFid: 7, username: "sam", amount: 300 });
  assert.equal(r2.ok && r2.pointsPending, true);
  assert.equal(sends.length, 2);
  let st = await anonTipsStatus(d, 7);
  assert.equal(st.giftPoints, 0);
  assert.equal(st.pendingPoints, 6);
  assert.equal(st.tipped, 600);
  const [, second] = await sql<{ id: number }>`select id from anon_tips order by id`;
  assert.equal((await voidPendingPoints(sql, second.id, 209707)).ok, true);
  assert.equal((await sweepTipReviews(sql, NOW + 6 * DAY)).released, 0);
  assert.equal((await sweepTipReviews(sql, NOW + 7 * DAY + 1000)).released, 1);
  st = await anonTipsStatus(d, 7);
  assert.equal(st.giftPoints, 3);
  assert.equal(st.pendingPoints, 0);
});

test("history queries: reciprocity and wallet reuse across fids are detected from the database", async () => {
  const { sql } = await testDb();
  await addClaim(sql, { fid: 7, address: A, amount: 5000 });
  await addClaim(sql, { fid: 99, address: B, amount: 5000 });
  await addClaim(sql, { fid: 55, address: B, amount: 100, day: "2026-11-09" }); // B also claimed under fid 55
  const { d } = harness(sql, "log", GOOD());
  await sendAnonTip(d, { senderFid: 99, username: "andy", amount: 100 });
  await sendAnonTip(d, { senderFid: 7, username: "nick", amount: 100 });
  const [row] = await sql<{ risk_flags: string[] }>`select risk_flags from anon_tips where sender_fid = 7`;
  assert.ok(row.risk_flags.includes("H3_reciprocal"));
  assert.ok(row.risk_flags.includes("H4_wallet_reuse"));
});
