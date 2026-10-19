import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { validateFeedback, FEEDBACK_NA } from "./feedback-core";
import { feedbackStatus, submitFeedback, type FeedbackPayer, type FeedbackSql } from "./feedback.server";
import { FEEDBACK_REWARD_YOUCOG } from "../../constants/feedback";

const GOOD = {
  q1: "Farcaster",
  q2: ["Faucet", "Listen boost"],
  q3: "Free YOUCOG and private research",
  q4: 5,
  q5: FEEDBACK_NA,
  q6: "no",
  q7: "Daily",
  q8: "Bigger streak rewards",
  q9: "More games",
  q10: 9,
};
const A1 = "0x1111111111111111111111111111111111111111";
const A2 = "0x2222222222222222222222222222222222222222";
const A3 = "0x3333333333333333333333333333333333333333";
const FAUCET = "0x3067ab541253746AB353b842Fdc0970ffBDe13c7";

test("FEEDBACK_REWARD_YOUCOG defaults to 1M", () => {
  assert.equal(FEEDBACK_REWARD_YOUCOG, 1_000_000);
});

test("validateFeedback accepts a complete, plausible survey", () => {
  const r = validateFeedback({ ...GOOD, comment: "  love it  ", extra: "dropped" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.answers.comment, "love it");
  assert.equal("extra" in r.answers, false);
});

test("validateFeedback rejects missing, out-of-range and junk answers", () => {
  assert.equal(validateFeedback({ ...GOOD, q1: undefined }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q1: "Myspace" }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q2: [] }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q4: 6 }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q4: FEEDBACK_NA }).ok, false, "q4 has no 'not tried' option");
  assert.equal(validateFeedback({ ...GOOD, q10: 11 }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q3: "  " }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q3: "aaaaaaa" }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q8: "12345" }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q3: "x".repeat(501) }).ok, false);
  assert.equal(validateFeedback({ ...GOOD, q3: "same thing", q6: "same thing", q8: "same thing" }).ok, false);
});

async function db(): Promise<FeedbackSql> {
  const pg = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(join(dir, f), "utf8"));
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  }) as FeedbackSql;
}

function fakePayer(opts: { fail?: boolean; tokens?: bigint } = {}) {
  const sent: { to: string; wei: bigint }[] = [];
  const payer: FeedbackPayer = {
    address: FAUCET,
    minGasWei: 1n,
    balances: async () => ({ eth: 10n ** 18n, tokens: opts.tokens ?? 100_000_000n * 10n ** 18n }),
    send: async (to, wei) => {
      if (opts.fail) throw new Error("nonce too low");
      sent.push({ to, wei });
      return `0x${"ab".repeat(32)}` as `0x${string}`;
    },
  };
  return { payer, sent };
}

let seedDay = 0;
async function seedClaim(sql: FeedbackSql, who: { fid?: number; address: string }) {
  const day = new Date(Date.UTC(2026, 8, 1) + seedDay++ * 86_400_000).toISOString().slice(0, 10);
  await sql`insert into faucet_claims (day, address, ip_hash, amount, status, fid) values (${day}, ${who.address}, ${"h" + who.address}, 420, 'sent', ${who.fid ?? null})`;
}

test("pays once per FID and once per wallet; answers are stored", async () => {
  const sql = await db();
  const { payer, sent } = fakePayer();
  await seedClaim(sql, { fid: 42, address: A1 });

  const ok = await submitFeedback(sql, payer, { answers: GOOD, address: A1, fid: 42 });
  assert.equal(ok.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].wei, BigInt(FEEDBACK_REWARD_YOUCOG) * 10n ** 18n);

  const stored = await sql<{ answers: Record<string, unknown>; status: string; amount: number }>`select answers, status, amount from feedback_responses`;
  assert.equal(stored[0].status, "sent");
  assert.equal(stored[0].amount, FEEDBACK_REWARD_YOUCOG);
  assert.equal(stored[0].answers.q1, "Farcaster");

  // Same FID, new wallet: refused.
  const againFid = await submitFeedback(sql, payer, { answers: GOOD, address: A2, fid: 42 });
  assert.equal(againFid.ok, false);
  // Same wallet from the web (lowercased): refused.
  await seedClaim(sql, { address: A1 });
  const againAddr = await submitFeedback(sql, payer, { answers: GOOD, address: A1.toLowerCase(), ipHash: "ip-1" });
  assert.equal(againAddr.ok, false);
  // Different FID, same wallet: refused.
  await seedClaim(sql, { fid: 43, address: A1 });
  assert.equal((await submitFeedback(sql, payer, { answers: GOOD, address: A1, fid: 43 })).ok, false);
  assert.equal(sent.length, 1, "never paid twice");
  assert.equal((await feedbackStatus(sql, { fid: 42 })).done, true);
});

test("the DB unique indexes block a second reward even if the app check is skipped", async () => {
  const sql = await db();
  await sql`insert into feedback_responses (fid, address, answers, amount) values (7, ${A3}, '{}'::jsonb, 1)`;
  await assert.rejects(sql`insert into feedback_responses (fid, address, answers, amount) values (7, ${A2}, '{}'::jsonb, 1)`);
  await assert.rejects(sql`insert into feedback_responses (fid, address, answers, amount) values (8, ${A3.toUpperCase().replace("0X", "0x")}, '{}'::jsonb, 1)`);
  await sql`insert into feedback_responses (address, ip_hash, answers, amount) values (${A2}, 'ip-9', '{}'::jsonb, 1)`;
  await assert.rejects(sql`insert into feedback_responses (address, ip_hash, answers, amount) values (${A1}, 'ip-9', '{}'::jsonb, 1)`);
  // A failed payout frees the slot.
  await sql`update feedback_responses set status = 'failed' where fid = 7`;
  await sql`insert into feedback_responses (fid, address, answers, amount) values (7, ${A3}, '{}'::jsonb, 1)`;
});

test("web: needs a prior faucet claim, one per connection, failed payout can retry", async () => {
  const sql = await db();
  const noClaim = await submitFeedback(sql, fakePayer().payer, { answers: GOOD, address: A2, ipHash: "ip-2" });
  assert.equal(noClaim.ok, false);

  await seedClaim(sql, { address: A2 });
  const failing = fakePayer({ fail: true });
  const failed = await submitFeedback(sql, failing.payer, { answers: GOOD, address: A2, ipHash: "ip-2" });
  assert.equal(failed.ok, false);
  const [day] = await sql<{ rewards: number }>`select rewards from feedback_days`;
  assert.equal(day.rewards, 0, "failed payout releases the daily slot");

  const { payer, sent } = fakePayer();
  assert.equal((await submitFeedback(sql, payer, { answers: GOOD, address: A2, ipHash: "ip-2" })).ok, true);
  assert.equal(sent.length, 1);

  // Another wallet on the same connection: refused.
  await seedClaim(sql, { address: A3 });
  assert.equal((await submitFeedback(sql, payer, { answers: GOOD, address: A3, ipHash: "ip-2" })).ok, false);
  assert.equal(sent.length, 1);
});

test("refuses bad answers, no payer, and a low faucet balance without paying", async () => {
  const sql = await db();
  await seedClaim(sql, { fid: 5, address: A1 });
  assert.equal((await submitFeedback(sql, fakePayer().payer, { answers: { ...GOOD, q7: "" }, address: A1, fid: 5 })).ok, false);
  assert.equal((await submitFeedback(sql, null, { answers: GOOD, address: A1, fid: 5 })).ok, false);
  const low = fakePayer({ tokens: 2_500_000n * 10n ** 18n });
  assert.equal((await submitFeedback(sql, low.payer, { answers: GOOD, address: A1, fid: 5 })).ok, false);
  assert.equal(low.sent.length, 0);
  const [n] = await sql<{ n: number }>`select count(*)::int as n from feedback_responses`;
  assert.equal(n.n, 0);
});
