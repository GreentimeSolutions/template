/** Ledger reads for the public endpoints and the optional daily Base anchor. */
import type { AnonTipsSql } from "./anon-tips.server.ts";
import { anchorCalldata, hex, toExportRow, verifyChain, type LedgerEvent } from "./ledger-core.ts";

type Row = {
  seq: number;
  event_type: string;
  ref_table: string | null;
  ref_id: number | null;
  payload: string;
  created_at: string;
  prev_hash: string;
  hash: string;
};

export async function ledgerOn(sql: AnonTipsSql): Promise<boolean> {
  try {
    const [r] = await sql<{ on: boolean }>`select ledger_is_on() as on`;
    return Boolean(r?.on);
  } catch {
    return false;
  }
}

export async function ledgerHead(sql: AnonTipsSql) {
  const on = await ledgerOn(sql);
  const [h] = await sql<{ seq: number; hash: string; created_at: string; n: number }>`
    select seq, encode(hash, 'hex') as hash, created_at::text as created_at, (select count(*) from ledger_events)::int as n
    from ledger_events order by seq desc limit 1`;
  const [a] = await sql<{ head_seq: number; head_hash: string; tx_hash: string | null; created_at: string }>`
    select head_seq, encode(head_hash, 'hex') as head_hash, tx_hash, created_at::text as created_at
    from ledger_anchors order by id desc limit 1`;
  return {
    ok: true as const,
    on,
    events: Number(h?.n ?? 0),
    headSeq: h ? Number(h.seq) : null,
    headHash: h ? hex(h.hash) : null,
    headAt: h?.created_at ?? null,
    lastAnchor: a ? { seq: Number(a.head_seq), hash: hex(a.head_hash), txHash: a.tx_hash, at: a.created_at } : null,
    spec: "sha256(seq \\n event_type \\n payload \\n hex(prev_hash)); genesis prev = 32 zero bytes",
  };
}

/** Public, redacted export: payloads as stored (no sender fids by design), never salts. */
export async function ledgerExport(sql: AnonTipsSql, fromSeq = 0, limit = 500): Promise<LedgerEvent[]> {
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  const from = Math.max(0, Math.floor(fromSeq));
  const rows = await sql<Row>`
    select seq, event_type, ref_table, ref_id, payload,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      encode(prev_hash, 'hex') as prev_hash, encode(hash, 'hex') as hash
    from ledger_events where seq >= ${from} order by seq asc limit ${lim}`;
  return rows.map((r) => toExportRow(r));
}

/** Server-side light check of the whole chain (small today; paginate if it grows). */
export async function ledgerSelfCheck(sql: AnonTipsSql) {
  const all: LedgerEvent[] = [];
  for (let from = 0; ; ) {
    const page = await ledgerExport(sql, from, 1000);
    all.push(...page);
    if (page.length < 1000) break;
    from = page[page.length - 1].seq + 1;
  }
  return verifyChain(all);
}

// ---------------------------------------------------------------------------
// Optional daily anchor on Base. Off unless LEDGER_ANCHOR_ON=1 AND a dedicated
// LEDGER_ANCHOR_PRIVATE_KEY is configured. No wallet is created or funded by this code.

export type AnchorDeps = {
  sql: AnonTipsSql;
  enabled: boolean;
  /** Build only, never send. */
  dryRun: boolean;
  dataSuffix: string;
  /** Sends a 0-value self-transfer with calldata; returns tx hash. Undefined = no key. */
  sendAnchorTx?: (data: `0x${string}`) => Promise<`0x${string}`>;
};

export async function runLedgerAnchor(d: AnchorDeps) {
  if (!d.enabled) return { ok: false as const, reason: "anchoring is off (LEDGER_ANCHOR_ON)" };
  const [h] = await d.sql<{ seq: number; hash: string }>`select seq, encode(hash, 'hex') as hash from ledger_events order by seq desc limit 1`;
  if (!h) return { ok: false as const, reason: "ledger is empty" };
  const [last] = await d.sql<{ head_seq: number }>`select head_seq from ledger_anchors order by id desc limit 1`;
  if (last && Number(last.head_seq) === Number(h.seq)) return { ok: true as const, skipped: "head unchanged", seq: Number(h.seq) };
  const data = anchorCalldata(Number(h.seq), h.hash, d.dataSuffix);
  if (d.dryRun || !d.sendAnchorTx) return { ok: true as const, dryRun: true, seq: Number(h.seq), headHash: hex(h.hash), calldata: data };
  const txHash = await d.sendAnchorTx(data);
  await d.sql`insert into ledger_anchors (head_seq, head_hash, tx_hash) values (${Number(h.seq)}, decode(${hex(h.hash)}, 'hex'), ${txHash})`;
  return { ok: true as const, seq: Number(h.seq), headHash: hex(h.hash), txHash };
}
