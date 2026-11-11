/**
 * Pure tamper-evident ledger helpers (no I/O), shared by the verify script,
 * the public endpoints and tests. Must match the SQL in migrations/0017_ledger.sql:
 *
 *   hash = sha256(utf8(seq || "\n" || event_type || "\n" || payload || "\n" || hex(prev_hash)))
 *   genesis prev_hash = 32 zero bytes
 *   sender_commit / fid_commit = sha256(utf8(hex(salt) || ":" || fid))
 */
import { createHash } from "node:crypto";

export const ZERO_HASH = "00".repeat(32);
export const LEDGER_EVENT_TYPES = [
  "genesis",
  "tip.created",
  "tip.status",
  "points.created",
  "points.state",
  "balance.adjust",
  "review.decision",
] as const;

export type LedgerEvent = {
  seq: number;
  event_type: string;
  ref_table: string | null;
  ref_id: number | null;
  payload: string;
  created_at: string;
  prev_hash: string; // hex, no 0x
  hash: string; // hex, no 0x
};

export function hex(v: string): string {
  return String(v ?? "").trim().toLowerCase().replace(/^\\x/, "").replace(/^0x/, "");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

export function ledgerHashHex(seq: number, eventType: string, payload: string, prevHashHex: string): string {
  return sha256Hex(`${seq}\n${eventType}\n${payload}\n${hex(prevHashHex)}`);
}

export function commitHex(saltHex: string, value: string | number): string {
  return sha256Hex(`${hex(saltHex)}:${value}`);
}

export type ChainCheck =
  | { ok: true; checked: number; headSeq: number | null; headHash: string | null }
  | { ok: false; checked: number; badSeq: number; reason: string };

/**
 * Walk events in order and check contiguity, prev links and every hash.
 * `start` lets a verifier continue from a known-good (seq, hash).
 */
export function verifyChain(events: LedgerEvent[], start?: { seq: number; hash: string }): ChainCheck {
  let expectSeq = start ? start.seq + 1 : 0;
  let prev = start ? hex(start.hash) : ZERO_HASH;
  let checked = 0;
  for (const e of events) {
    const seq = Number(e.seq);
    if (seq !== expectSeq) return { ok: false, checked, badSeq: seq, reason: `expected seq ${expectSeq}, got ${seq}` };
    if (hex(e.prev_hash) !== prev) return { ok: false, checked, badSeq: seq, reason: "prev_hash does not match the previous event's hash" };
    if (seq === 0 && e.event_type !== "genesis") return { ok: false, checked, badSeq: seq, reason: "seq 0 must be genesis" };
    if (!(LEDGER_EVENT_TYPES as readonly string[]).includes(e.event_type)) {
      return { ok: false, checked, badSeq: seq, reason: `unknown event_type ${e.event_type}` };
    }
    const want = ledgerHashHex(seq, e.event_type, e.payload, prev);
    if (hex(e.hash) !== want) return { ok: false, checked, badSeq: seq, reason: "hash mismatch (payload or fields changed)" };
    try {
      JSON.parse(e.payload);
    } catch {
      return { ok: false, checked, badSeq: seq, reason: "payload is not JSON" };
    }
    prev = want;
    expectSeq = seq + 1;
    checked += 1;
  }
  const last = events[events.length - 1];
  return { ok: true, checked, headSeq: last ? Number(last.seq) : start?.seq ?? null, headHash: last ? hex(last.hash) : start ? hex(start.hash) : null };
}

/** Public export rows: same as stored. Payloads never contain sender fids; salts are never exported. */
export function toExportRow(e: LedgerEvent): LedgerEvent {
  return {
    seq: Number(e.seq),
    event_type: e.event_type,
    ref_table: e.ref_table,
    ref_id: e.ref_id == null ? null : Number(e.ref_id),
    payload: e.payload,
    created_at: e.created_at,
    prev_hash: hex(e.prev_hash),
    hash: hex(e.hash),
  };
}

/** Guard for the public export: a payload must never carry a raw sender/fid field. */
export function payloadIsRedacted(payload: string): boolean {
  try {
    const o = JSON.parse(payload) as Record<string, unknown>;
    return !("sender_fid" in o) && !("fid" in o) && !("salt" in o);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// On-chain anchor calldata: "YCOGLEDGER1" || seq (uint64 BE) || head hash (32 bytes) [|| ERC-8021 suffix]

export const ANCHOR_MAGIC_HEX = Buffer.from("YCOGLEDGER1", "utf8").toString("hex");

export function anchorCalldata(seq: number, headHashHex: string, suffixHex = ""): `0x${string}` {
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error("bad seq");
  const h = hex(headHashHex);
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("bad head hash");
  const seqHex = BigInt(seq).toString(16).padStart(16, "0");
  return `0x${ANCHOR_MAGIC_HEX}${seqHex}${h}${hex(suffixHex)}` as `0x${string}`;
}

export function parseAnchorCalldata(data: string): { seq: number; headHash: string } | null {
  const d = hex(data);
  if (!d.startsWith(ANCHOR_MAGIC_HEX)) return null;
  const rest = d.slice(ANCHOR_MAGIC_HEX.length);
  if (rest.length < 16 + 64) return null;
  return { seq: Number(BigInt(`0x${rest.slice(0, 16)}`)), headHash: rest.slice(16, 80) };
}

// ---------------------------------------------------------------------------
// Tip transfer check against a transaction receipt (ERC-20 Transfer log).

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type Log = { address: string; topics: string[]; data: string };

function topicAddress(t: string): string {
  return `0x${hex(t).slice(-40)}`;
}

export function receiptHasTransfer(
  receipt: { status?: string; logs?: Log[] } | null | undefined,
  want: { token: string; from: string; to: string; amountWei: bigint },
): boolean {
  if (!receipt || (receipt.status !== undefined && receipt.status !== "0x1" && receipt.status !== "success")) return false;
  return (receipt.logs ?? []).some(
    (l) =>
      l.address?.toLowerCase() === want.token.toLowerCase() &&
      l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
      topicAddress(l.topics[1] ?? "") === want.from.toLowerCase() &&
      topicAddress(l.topics[2] ?? "") === want.to.toLowerCase() &&
      BigInt(l.data && l.data !== "0x" ? l.data : "0x0") === want.amountWei,
  );
}
