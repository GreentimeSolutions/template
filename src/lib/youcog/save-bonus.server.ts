/**
 * Save bonus: +10% of a faucet claim, once per claim, for wallets that still hold
 * what they claimed 7 days later. All chain and DB access is injected so the
 * whole flow runs against PGLite and a fake chain in tests.
 */
import { SAVE_BONUS_MAX_CLAIMS_PER_TAP, SAVE_BONUS_RATE_LABEL } from "../../constants/save-bonus";
import { classify, expireMs, groupByAddress, holdsEnough, saveBonusAmount, unlockMs, type SaveClaim } from "./save-bonus-core";

export type SaveSql = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

/** Who is asking: a verified Farcaster FID (Mini App) or a Base address (web). */
export type SaveWho = { fid: number } | { address: string };

export type SaveBonusDeps = {
  sql: SaveSql;
  /** SAVE_BONUS_SINCE in ms; null = closed. */
  sinceMs: number | null;
  nowMs?: number;
  faucetAddress: string;
  dailyTokenBudget: number;
  /** Faucet YOUCOG floor (same 2M floor the listen boost keeps). */
  minFaucetTokens: number;
  minGasWei: bigint;
  balanceOf: (address: `0x${string}`) => Promise<bigint>;
  faucetBalances: () => Promise<{ eth: bigint; tokens: bigint }>;
  send: (to: `0x${string}`, amountWei: bigint) => Promise<string>;
};

export type SaveBonusStatus =
  | { open: false }
  | {
      open: true;
      ready: number;
      readyBonus: number;
      nextUnlockAt: string | null;
      nextBonus: number;
      paidTotal: number;
      oldestReadyExpiresAt: string | null;
    };

export type SavePaid = { address: string; claims: number; bonus: number; txHash: string; url: string };
export type SaveSkip = { address: string; reason: string };
export type SaveBonusResult =
  | { ok: true; paid: SavePaid[]; skipped: SaveSkip[]; total: number }
  | { ok: false; reason: string; skipped?: SaveSkip[] };

const WEI = 10n ** 18n;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Sent faucet claims for this identity that have no live (pending/sent) save bonus yet. */
async function unpaidClaims(sql: SaveSql, who: SaveWho): Promise<SaveClaim[]> {
  const rows =
    "fid" in who
      ? await sql<{ id: number; address: string; fid: number | null; amount: number; created_ms: number }>`
          select c.id, c.address, c.fid, c.amount, (extract(epoch from c.created_at) * 1000)::float8 as created_ms
          from faucet_claims c
          where c.status = 'sent' and c.fid = ${who.fid}
            and not exists (select 1 from save_bonuses b where b.claim_id = c.id and b.status <> 'failed')
          order by c.created_at limit 400`
      : await sql<{ id: number; address: string; fid: number | null; amount: number; created_ms: number }>`
          select c.id, c.address, c.fid, c.amount, (extract(epoch from c.created_at) * 1000)::float8 as created_ms
          from faucet_claims c
          where c.status = 'sent' and lower(c.address) = lower(${who.address})
            and not exists (select 1 from save_bonuses b where b.claim_id = c.id and b.status <> 'failed')
          order by c.created_at limit 400`;
  return rows.map((r) => ({
    id: Number(r.id),
    address: String(r.address),
    fid: r.fid == null ? null : Number(r.fid),
    amount: Number(r.amount),
    createdMs: Number(r.created_ms),
  }));
}

async function paidTotal(sql: SaveSql, who: SaveWho): Promise<number> {
  const rows =
    "fid" in who
      ? await sql<{ n: number }>`select coalesce(sum(b.amount), 0)::int as n from save_bonuses b join faucet_claims c on c.id = b.claim_id where b.status = 'sent' and c.fid = ${who.fid}`
      : await sql<{ n: number }>`select coalesce(sum(amount), 0)::int as n from save_bonuses where status = 'sent' and lower(address) = lower(${who.address})`;
  return Number(rows[0]?.n ?? 0);
}

export async function saveBonusStatus(
  deps: Pick<SaveBonusDeps, "sql" | "sinceMs" | "nowMs">,
  who: SaveWho,
): Promise<SaveBonusStatus> {
  if (deps.sinceMs == null) return { open: false };
  const now = deps.nowMs ?? Date.now();
  const { ready, waiting } = classify(await unpaidClaims(deps.sql, who), now, deps.sinceMs);
  const next = waiting[0];
  return {
    open: true,
    ready: ready.length,
    readyBonus: ready.reduce((s, c) => s + saveBonusAmount(c.amount), 0),
    nextUnlockAt: next ? new Date(unlockMs(next.createdMs)).toISOString() : null,
    nextBonus: next ? saveBonusAmount(next.amount) : 0,
    paidTotal: await paidTotal(deps.sql, who),
    oldestReadyExpiresAt: ready[0] ? new Date(expireMs(ready[0].createdMs)).toISOString() : null,
  };
}

/**
 * Settle every unlocked claim for this identity: per address, read balanceOf
 * now, and if it covers the claims being settled, pay 10% of each claim in one
 * transfer to that address. Each claim can be paid once (unique index).
 */
export async function claimSaveBonus(deps: SaveBonusDeps, who: SaveWho): Promise<SaveBonusResult> {
  if (deps.sinceMs == null) return { ok: false, reason: "The save bonus isn't open yet." };
  const { sql } = deps;
  const now = deps.nowMs ?? Date.now();
  const day = utcDay(now);
  const all = classify(await unpaidClaims(sql, who), now, deps.sinceMs);
  const ready = all.ready.slice(0, SAVE_BONUS_MAX_CLAIMS_PER_TAP);
  if (!ready.length) {
    const next = all.waiting[0];
    return {
      ok: false,
      reason: next
        ? `Nothing to collect yet. Your next save bonus unlocks ${new Date(unlockMs(next.createdMs)).toUTCString().replace(/:\d\d GMT$/, " UTC")}.`
        : "No claims are waiting for a save bonus. Claim from the faucet, keep it for 7 days, then come back.",
    };
  }

  const groups = groupByAddress(ready).filter((g) => g.address.toLowerCase() !== deps.faucetAddress.toLowerCase());
  const skipped: SaveSkip[] = [];
  const passing: { group: (typeof groups)[number]; balance: bigint }[] = [];
  for (const g of groups) {
    let bal: bigint;
    try {
      bal = await deps.balanceOf(g.address as `0x${string}`);
    } catch {
      return { ok: false, reason: "Couldn't reach the Base network. Try again in a minute." };
    }
    if (holdsEnough(bal, g.required)) passing.push({ group: g, balance: bal });
    else
      skipped.push({
        address: g.address,
        reason: `${short(g.address)} holds ${fmt(Number(bal / WEI))} YOUCOG, less than the ${fmt(g.required)} it claimed. The save bonus needs the claimed YOUCOG still in that wallet.`,
      });
  }
  if (!passing.length) return { ok: false, reason: skipped[0]?.reason ?? "No wallet qualified.", skipped };

  let faucet: { eth: bigint; tokens: bigint };
  try {
    faucet = await deps.faucetBalances();
  } catch {
    return { ok: false, reason: "Couldn't reach the Base network. Try again in a minute.", skipped };
  }
  if (faucet.eth < deps.minGasWei) return { ok: false, reason: "The faucet is out of gas (ETH). Try again after it's topped up.", skipped };
  let faucetTokens = faucet.tokens;

  const paid: SavePaid[] = [];
  let stopReason: string | null = null;
  for (const { group, balance } of passing) {
    // Reserve each claim first; the unique index stops a double payout from a concurrent tap.
    const reserved: { rowId: number; bonus: number }[] = [];
    for (const c of group.claims) {
      const bonus = saveBonusAmount(c.amount);
      try {
        const rows = await sql<{ id: number }>`
          insert into save_bonuses (claim_id, day, address, fid, claim_amount, amount, balance_wei)
          values (${c.id}, ${day}, ${group.address}, ${c.fid}, ${c.amount}, ${bonus}, ${balance.toString()})
          returning id`;
        reserved.push({ rowId: Number(rows[0].id), bonus });
      } catch {
        /* already paid or being paid by another request */
      }
    }
    if (!reserved.length) continue;
    const ids = reserved.map((r) => r.rowId);
    const total = reserved.reduce((s, r) => s + r.bonus, 0);
    const fail = (why: string) => sql`update save_bonuses set status = 'failed', error = ${why} where id = any(${ids})`;

    const totalWei = BigInt(total) * WEI;
    if (faucetTokens - totalWei < BigInt(deps.minFaucetTokens) * WEI) {
      await fail("faucet floor");
      stopReason = "The faucet is running low, so save bonuses are paused for now.";
      break;
    }
    // Same daily token budget as faucet claims (bonus counts toward it).
    const budget = deps.dailyTokenBudget;
    const bumped =
      total > budget
        ? []
        : await sql`
            insert into faucet_days (day, claims, tokens) values (${day}, 0, ${total})
            on conflict (day) do update set tokens = faucet_days.tokens + ${total}
            where faucet_days.tokens + ${total} <= ${budget}
            returning tokens`;
    if (!bumped.length) {
      await fail("daily budget");
      stopReason = "Today's faucet budget is used up. Your save bonus is still waiting; try again after midnight UTC.";
      break;
    }
    try {
      const txHash = await deps.send(group.address as `0x${string}`, totalWei);
      await sql`update save_bonuses set status = 'sent', tx_hash = ${txHash} where id = any(${ids})`;
      faucetTokens -= totalWei;
      paid.push({ address: group.address, claims: reserved.length, bonus: total, txHash, url: `https://basescan.org/tx/${txHash}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 300) : "send failed";
      await fail(msg);
      await sql`update faucet_days set tokens = tokens - ${total} where day = ${day}`;
      stopReason = /insufficient funds/i.test(msg)
        ? "The faucet is out of gas (ETH). Try again after it's topped up."
        : "The transfer didn't go through. Nothing was used up, so you can try again.";
      break;
    }
  }

  if (!paid.length) return { ok: false, reason: stopReason ?? "Those claims were already collected.", skipped };
  if (stopReason) skipped.push({ address: "", reason: stopReason });
  return { ok: true, paid, skipped, total: paid.reduce((s, p) => s + p.bonus, 0) };
}

export const SAVE_BONUS_SUMMARY = `Keep the YOUCOG you claim for 7 days and collect an extra ${SAVE_BONUS_RATE_LABEL} of that claim, once per claim.`;
