import { test } from "node:test";
import assert from "node:assert/strict";
import { FAUCET_ADDRESS, TRANSFER_TOPIC, YOUCOG_TOKEN, priceWei, verifyPurchase, type Receipt } from "./shop-verify-core";
import { recordPurchase } from "./shop.server";

const BUYER = "0x1111111111111111111111111111111111111111";
const pad = (a: string) => `0x${"0".repeat(24)}${a.slice(2).toLowerCase()}`;
const amt = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
const W = 10n ** 18n;
const rc = (o: { to?: string; from?: string; value?: bigint; status?: "success" | "reverted"; token?: string } = {}): Receipt => ({
  status: o.status ?? "success", blockNumber: 1n,
  logs: [{ address: o.token ?? YOUCOG_TOKEN, topics: [TRANSFER_TOPIC, pad(o.from ?? BUYER), pad(o.to ?? FAUCET_ADDRESS)], data: amt(o.value ?? 10000n * W) }],
});

test("prices come from the server table; quest-only and starter items aren't for sale", () => {
  assert.equal(priceWei("crown"), 10000n * W);
  assert.equal(priceWei("shades-red"), null);
  assert.equal(priceWei("fedora-white"), null);
  assert.equal(priceWei("nope"), null);
});
test("valid transfer passes", () => assert.deepEqual(verifyPurchase(rc(), BUYER, "crown"), { ok: true, amount: 10000n * W }));
test("wrong recipient fails", () => assert.equal((verifyPurchase(rc({ to: "0x2222222222222222222222222222222222222222" }), BUYER, "crown") as { code: string }).code, "no-transfer"));
test("wrong sender fails", () => assert.equal((verifyPurchase(rc({ from: "0x2222222222222222222222222222222222222222" }), BUYER, "crown") as { code: string }).code, "no-transfer"));
test("wrong token fails", () => assert.equal((verifyPurchase(rc({ token: "0x3333333333333333333333333333333333333333" }), BUYER, "crown") as { code: string }).code, "no-transfer"));
test("too little fails", () => assert.equal((verifyPurchase(rc({ value: 9999n * W }), BUYER, "crown") as { code: string }).code, "too-little"));
test("failed tx fails", () => assert.equal((verifyPurchase(rc({ status: "reverted" }), BUYER, "crown") as { code: string }).code, "failed-tx"));
test("quest-only item can't be bought even with payment", () => assert.equal((verifyPurchase(rc(), BUYER, "shades-red") as { code: string }).code, "not-for-sale"));

// Fake SQL: tx_hash-keyed store, enough for recordPurchase.
function fakeSql() {
  const rows: { tx_hash: string; address: string; item_id: string }[] = [];
  const sql = (async (strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join("?");
    if (q.startsWith("select address, item_id")) return rows.filter((r) => r.tx_hash === v[0]);
    if (q.startsWith("select distinct item_id")) return [...new Set(rows.filter((r) => r.address === v[0]).map((r) => r.item_id))].map((item_id) => ({ item_id }));
    if (q.startsWith("insert")) { if (rows.some((r) => r.tx_hash === v[0])) return []; rows.push({ tx_hash: v[0] as string, address: v[1] as string, item_id: v[2] as string }); return [{ tx_hash: v[0] }]; }
    throw new Error(q);
  }) as never;
  return { sql, rows };
}
const H = `0x${"ab".repeat(32)}`;
test("records once; reused hash for another item/wallet is rejected; pending when no receipt", async () => {
  const { sql } = fakeSql();
  const ok = await recordPurchase({ address: BUYER, itemId: "crown", txHash: H }, async () => rc(), sql);
  assert.equal(ok.status, 200); assert.deepEqual((ok.body as { owned: string[] }).owned, ["crown"]);
  const again = await recordPurchase({ address: BUYER, itemId: "crown", txHash: H }, async () => rc(), sql);
  assert.equal(again.status, 200); // idempotent retry
  const reuse = await recordPurchase({ address: BUYER, itemId: "party", txHash: H }, async () => rc(), sql);
  assert.equal(reuse.status, 409);
  const pend = await recordPurchase({ address: BUYER, itemId: "crown", txHash: `0x${"cd".repeat(32)}` }, async () => null, sql);
  assert.equal(pend.status, 202);
  const bad = await recordPurchase({ address: "nope", itemId: "crown", txHash: H }, async () => rc(), sql);
  assert.equal(bad.status, 400);
  const low = await recordPurchase({ address: BUYER, itemId: "crown", txHash: `0x${"ef".repeat(32)}` }, async () => rc({ value: 1n }), sql);
  assert.equal(low.status, 422);
});
