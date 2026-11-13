import { test } from "node:test";
import assert from "node:assert/strict";
import { testDb } from "./test-db.ts";
import { streakTimeline } from "./streak-timeline.server.ts";
import { buildTimeline, formatAmount, toIso, timelineCursor, timelineLimit, whenLabel } from "./streak-timeline-core.ts";

const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

async function seeded() {
  const { sql, pg } = await testDb();
  const claim = (fid: number, day: string, amount: number, streak: number, status = "sent") =>
    pg.query(
      `insert into faucet_claims (day, address, ip_hash, amount, status, tx_hash, fid, base_amount, streak, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $4, $8, ($1::date + time '14:00')::timestamptz)`,
      [day, `0x${String(fid).padStart(40, "0")}`, `ip-${fid}-${day}`, amount, status, TX(fid * 100 + streak), fid, streak],
    );
  const tip = (sender: number, to: string, amount: number, status: string, at: string, tx: string | null) =>
    pg.query(
      `insert into anon_tips (sender_fid, recipient_fid, recipient_username, recipient_address, amount, gift_points, status, tx_hash, created_at)
       values ($1, 999, $2, '0x0000000000000000000000000000000000000999', $3, 1, $4, $5, $6::timestamptz)`,
      [sender, to, amount, status, tx, at],
    );
  for (let d = 5; d <= 8; d++) await claim(42, `2026-11-${String(d + 5).padStart(2, "0")}`, d === 7 ? 6660 : 2220, d);
  await claim(42, "2026-11-09", 2220, 4, "failed");
  await claim(77, "2026-11-12", 1110, 3); // someone else
  await tip(42, "alice", 500, "sent", "2026-11-12T18:00:00Z", TX(1));
  await tip(42, "sam", 100, "held", "2026-11-08T18:00:00Z", null);
  await tip(42, "nope", 100, "dry_run", "2026-11-09T18:00:00Z", null);
  await tip(42, "failed", 100, "failed", "2026-11-09T19:00:00Z", null);
  await tip(77, "bob", 12345, "sent", "2026-11-12T19:00:00Z", TX(2)); // another sender's tip
  return { sql, pg };
}

test("timeline returns only the signed-in FID's own claims and sent tips, newest first", async () => {
  const { sql } = await seeded();
  const { events, nextBefore } = await streakTimeline(sql, 42, { limit: 30 });
  assert.deepEqual(
    events.map((e) => (e.kind === "claim" ? `claim:${e.streakDay}:${e.amount}${e.bonus ? ":3x" : ""}` : `tip:${e.recipientUsername}:${e.state}`)),
    ["claim:8:2220", "claim:7:6660:3x", "tip:alice:sent", "claim:6:2220", "claim:5:2220", "tip:sam:held"],
  );
  assert.equal(nextBefore, null);
  const json = JSON.stringify(events);
  assert.ok(!json.includes("bob") && !json.includes("12345") && !json.includes("1110"), "never leaks another FID's rows");
  assert.ok(!json.includes("sender"), "no sender field in the payload");
  const alice = events.find((e) => e.kind === "tip" && e.recipientUsername === "alice");
  assert.equal(alice?.kind === "tip" ? alice.txHash : null, TX(1));
});

test("an FID with no activity gets an empty timeline; limit + before paginate", async () => {
  const { sql } = await seeded();
  assert.deepEqual((await streakTimeline(sql, 5, { limit: 30 })).events, []);
  const p1 = await streakTimeline(sql, 42, { limit: 2 });
  assert.equal(p1.events.length, 2);
  assert.ok(p1.nextBefore);
  const p2 = await streakTimeline(sql, 42, { limit: 2, before: p1.nextBefore! });
  assert.deepEqual(p2.events.map((e) => e.id).filter((id) => p1.events.some((x) => x.id === id)), []);
  assert.equal(p2.events[0].kind, "tip");
  await assert.rejects(streakTimeline(sql, 0, { limit: 30 }));
});

test("limit/cursor parsing, amounts with commas, UTC day labels", () => {
  assert.equal(timelineLimit(null), 30);
  assert.equal(timelineLimit("5"), 5);
  assert.equal(timelineLimit("9999"), 50);
  assert.equal(timelineLimit("-1"), 30);
  assert.equal(timelineCursor("junk"), undefined);
  assert.equal(timelineCursor("2026-11-12T18:00:00Z"), "2026-11-12T18:00:00.000Z");
  assert.equal(formatAmount(6660), "6,660");
  assert.equal(formatAmount(1234567), "1,234,567");
  const now = Date.parse("2026-11-13T09:00:00Z");
  assert.equal(whenLabel("2026-11-13", now), "Today · Nov 13");
  assert.equal(whenLabel("2026-11-12", now), "Yesterday · Nov 12");
  assert.equal(whenLabel("2026-11-11", now), "Wed · Nov 11");
  assert.equal(whenLabel("2025-12-31", now), "Wed · Dec 31, 2025");
});

test("day 14 is also a 3x claim; tips without a real tx hash are not shown as verified", () => {
  const { events } = buildTimeline(
    [{ id: 1, day: "2026-11-01", amount: 6660, streak: 14, tx_hash: TX(9), created_at: "2026-11-01 10:00:00+00" }],
    [{ id: 2, recipient_username: "@x", amount: 5, status: "sent", tx_hash: "bogus", created_at: "2026-11-02 10:00:00+00" }],
    30,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].kind === "claim" && events[0].bonus, true);
});

test("postgres timestamptz text normalizes to ISO so the before cursor round-trips", () => {
  assert.equal(toIso("2026-11-13 09:10:00+00"), "2026-11-13T09:10:00.000Z");
  assert.equal(toIso("2026-11-13 09:10:00.123456+00"), "2026-11-13T09:10:00.123Z");
  assert.equal(toIso("2026-11-13 04:10:00-05"), "2026-11-13T09:10:00.000Z");
  assert.equal(timelineCursor(toIso("2026-11-13 09:10:00+00")), "2026-11-13T09:10:00.000Z");
});
