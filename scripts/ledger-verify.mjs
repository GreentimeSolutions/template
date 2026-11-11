#!/usr/bin/env node
/**
 * Independent verifier for the Youcognito tips ledger. No secrets needed for the public check.
 *
 *   node scripts/ledger-verify.mjs --url https://youcognito.com          # export + head from the site
 *   node scripts/ledger-verify.mjs --file ledger.ndjson                  # a saved export
 *   options: --rpc <base rpc url> (default https://mainnet.base.org), --no-chain (skip on-chain checks)
 *   --full   (needs DATABASE_URL, ideally a read-only auditor role): open sender commitments with the
 *            private salts, check every source row has its creation event, and reconcile gift_points.
 *
 * Needs Node 22.18+ / 24 (imports the TypeScript core directly).
 * Spec: hash = sha256(seq "\n" event_type "\n" payload "\n" hex(prev_hash)); genesis prev = 32 zero bytes.
 */
import { readFile } from "node:fs/promises";
import { commitHex, receiptHasTransfer, parseAnchorCalldata, verifyChain } from "../src/lib/youcog/ledger-core.ts";

const TOKEN = "0x92bff5d88157114dfc4a0a00f3496aa7e2e7eba3";
const FAUCET = "0x3067ab541253746ab353b842fdc0970ffbde13c7";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);

async function loadEvents() {
  const file = opt("--file");
  if (file) {
    return (await readFile(file, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => "seq" in e);
  }
  const base = opt("--url");
  if (!base) throw new Error("pass --url <site> or --file <export.ndjson>");
  const out = [];
  for (let from = 0; ; ) {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/ledger/export?from_seq=${from}&limit=1000`);
    if (!r.ok) throw new Error(`export HTTP ${r.status}`);
    const page = (await r.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => "seq" in e);
    out.push(...page);
    if (page.length < 1000) break;
    from = page[page.length - 1].seq + 1;
  }
  return out;
}

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

async function main() {
  const events = await loadEvents();
  const problems = [];
  const chain = verifyChain(events);
  console.log(chain.ok ? `chain OK: ${chain.checked} events, head seq ${chain.headSeq} hash ${chain.headHash}` : `CHAIN BROKEN at seq ${chain.badSeq}: ${chain.reason}`);
  if (!chain.ok) problems.push(`chain broken at seq ${chain.badSeq}`);

  for (const e of events) {
    const p = JSON.parse(e.payload);
    if ("sender_fid" in p || "fid" in p) problems.push(`seq ${e.seq}: payload exposes a raw fid`);
  }

  // Tips: latest tx hash per tip, amount/recipient from tip.created.
  const tips = new Map();
  for (const e of events) {
    const p = JSON.parse(e.payload);
    if (e.event_type === "tip.created") tips.set(p.id, { ...p, seq: e.seq });
    if (e.event_type === "tip.status" && tips.has(p.id)) Object.assign(tips.get(p.id), { status: p.status, tx_hash: p.tx_hash ?? tips.get(p.id).tx_hash });
  }
  const rpcUrl = opt("--rpc") || "https://mainnet.base.org";
  if (!has("--no-chain")) {
    let checked = 0;
    for (const t of tips.values()) {
      if (t.status !== "sent") continue;
      if (!t.tx_hash) {
        problems.push(`tip ${t.id}: status sent but no tx_hash`);
        continue;
      }
      const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [t.tx_hash]);
      const ok = receiptHasTransfer(receipt, { token: TOKEN, from: FAUCET, to: t.recipient_address, amountWei: BigInt(t.amount) * 10n ** 18n });
      console.log(`tip ${t.id} (seq ${t.seq}) ${t.amount} YOUCOG -> ${t.recipient_address}: ${ok ? "on-chain transfer matches" : "NO MATCHING TRANSFER"}`);
      if (!ok) problems.push(`tip ${t.id}: on-chain transfer mismatch`);
      checked += 1;
    }
    console.log(`on-chain: ${checked} sent tip(s) checked against Base`);

    const base = opt("--url");
    if (base) {
      const head = await (await fetch(`${base.replace(/\/$/, "")}/api/ledger/head`)).json();
      if (head?.lastAnchor?.txHash) {
        const tx = await rpc(rpcUrl, "eth_getTransactionByHash", [head.lastAnchor.txHash]);
        const a = tx ? parseAnchorCalldata(tx.input) : null;
        const ev = events.find((e) => e.seq === a?.seq);
        const ok = Boolean(a && ev && ev.hash === a.headHash);
        console.log(`anchor ${head.lastAnchor.txHash}: ${ok ? `matches seq ${a.seq}` : "DOES NOT MATCH"}`);
        if (!ok) problems.push("anchor mismatch");
      } else {
        console.log("anchor: none published yet");
      }
    }
  }

  if (has("--full")) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("--full needs DATABASE_URL (auditor role)");
    const { default: pg } = await import("pg");
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const salts = new Map((await c.query("select seq, encode(salt,'hex') s from ledger_salts")).rows.map((r) => [Number(r.seq), r.s]));
      const src = {
        anon_tips: (await c.query("select id, sender_fid from anon_tips")).rows,
        gift_points_ledger: (await c.query("select id, fid from gift_points_ledger")).rows,
        tip_balance_adjustments: (await c.query("select id, fid, note from tip_balance_adjustments")).rows,
        tip_risk_reviews: (await c.query("select id from tip_risk_reviews")).rows,
      };
      const created = { anon_tips: "tip.created", gift_points_ledger: "points.created", tip_balance_adjustments: "balance.adjust", tip_risk_reviews: "review.decision" };
      for (const [table, rows] of Object.entries(src)) {
        for (const row of rows) {
          const ev = events.find((e) => e.ref_table === table && Number(e.ref_id) === Number(row.id) && e.event_type === created[table]);
          if (!ev) {
            problems.push(`${table} ${row.id}: no ledger event (unlogged row)`);
            continue;
          }
          const p = JSON.parse(ev.payload);
          const salt = salts.get(ev.seq);
          const fid = row.sender_fid ?? row.fid;
          const commit = p.sender_commit ?? p.fid_commit;
          if (commit && (!salt || commitHex(salt, String(fid)) !== commit)) problems.push(`${table} ${row.id}: commitment does not open to the stored fid`);
        }
      }
      const recon = (
        await c.query(`select g.fid, g.points, coalesce(sum(l.points) filter (where l.state = 'credited'), 0)::int as credited
          from gift_points g left join gift_points_ledger l on l.fid = g.fid group by g.fid, g.points`)
      ).rows;
      for (const r of recon) if (Number(r.points) !== Number(r.credited)) problems.push(`gift_points mismatch for one sender (${r.points} vs ${r.credited} credited)`);
      console.log(`full: ${Object.values(src).reduce((n, r) => n + r.length, 0)} source rows checked, ${recon.length} gift point total(s) reconciled`);
    } finally {
      await c.end();
    }
  }

  if (problems.length) {
    console.log(`\nFAILED (${problems.length}):\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nVERIFIED");
}

main().catch((err) => {
  console.error("verify error:", err?.message || err);
  process.exit(2);
});
