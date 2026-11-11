/** I/O for tip risk checks: Neynar profiles (cached 1 day in fc_user_cache) and tip/claim history. */
import type { AnonTipsSql } from "./anon-tips.server.ts";
import { evaluateTipRisk, type FcProfile, type TipRiskConfig, type TipRiskInput, type TipRiskResult } from "./tip-risk-core.ts";

export type NeynarFetch = (fids: number[]) => Promise<FcProfile[] | null>;

type CacheRow = {
  fid: number;
  score: string | number | null;
  registered_at: string | null;
  follower_count: number | null;
  following_count: number | null;
  custody_address: string | null;
  eth_addresses: string[] | null;
  primary_eth: string | null;
  fetched_at: string;
};

function fromRow(r: CacheRow): FcProfile {
  return {
    fid: Number(r.fid),
    score: r.score == null ? null : Number(r.score),
    registeredAt: r.registered_at ? new Date(r.registered_at).toISOString() : null,
    followerCount: r.follower_count == null ? null : Number(r.follower_count),
    followingCount: r.following_count == null ? null : Number(r.following_count),
    custodyAddress: r.custody_address,
    ethAddresses: r.eth_addresses ?? [],
    primaryEth: r.primary_eth,
  };
}

/** Neynar `GET /v2/farcaster/user/bulk` (1 credit per fid). Returns null on any failure. */
export function neynarBulkFetcher(apiKey: string | undefined, fetchFn: typeof fetch = fetch): NeynarFetch {
  return async (fids) => {
    if (!apiKey || !fids.length) return null;
    try {
      const r = await fetchFn(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids.join(",")}`, {
        headers: { "x-api-key": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { users?: Record<string, unknown>[] };
      return (j.users ?? []).map((u) => {
        const va = (u.verified_addresses ?? {}) as { eth_addresses?: string[]; primary?: { eth_address?: string | null } };
        const score = (u.score ?? (u.experimental as { neynar_user_score?: number } | undefined)?.neynar_user_score) as number | undefined;
        return {
          fid: Number(u.fid),
          score: typeof score === "number" ? score : null,
          registeredAt: typeof u.registered_at === "string" ? u.registered_at : null,
          followerCount: typeof u.follower_count === "number" ? u.follower_count : null,
          followingCount: typeof u.following_count === "number" ? u.following_count : null,
          custodyAddress: typeof u.custody_address === "string" ? u.custody_address : null,
          ethAddresses: Array.isArray(va.eth_addresses) ? va.eth_addresses : [],
          primaryEth: va.primary?.eth_address ?? null,
        } satisfies FcProfile;
      });
    } catch {
      return null;
    }
  };
}

/** Profiles for fids, using the 1-day cache first and one bulk call for the rest. Missing -> null. */
export async function cachedProfiles(
  sql: AnonTipsSql,
  fids: number[],
  fetchProfiles: NeynarFetch,
  opts: { nowMs: number; cacheHours: number },
): Promise<Map<number, FcProfile | null>> {
  const out = new Map<number, FcProfile | null>();
  const unique = [...new Set(fids)];
  const cutoff = new Date(opts.nowMs - opts.cacheHours * 3_600_000).toISOString();
  let cacheOk = true;
  try {
    const rows = await sql<CacheRow>`
      select fid, score, registered_at::text as registered_at, follower_count, following_count,
        custody_address, eth_addresses, primary_eth, fetched_at::text as fetched_at
      from fc_user_cache where fid = any(${unique}) and fetched_at >= ${cutoff}::timestamptz`;
    for (const r of rows) out.set(Number(r.fid), fromRow(r));
  } catch {
    cacheOk = false;
  }
  const missing = unique.filter((f) => !out.has(f));
  if (missing.length) {
    const fetched = await fetchProfiles(missing);
    for (const f of missing) out.set(f, null);
    for (const p of fetched ?? []) {
      if (!missing.includes(p.fid)) continue;
      out.set(p.fid, p);
      if (!cacheOk) continue;
      try {
        await sql`
          insert into fc_user_cache (fid, score, registered_at, follower_count, following_count, custody_address, eth_addresses, primary_eth, fetched_at)
          values (${p.fid}, ${p.score}, ${p.registeredAt}::timestamptz, ${p.followerCount}, ${p.followingCount},
            ${p.custodyAddress?.toLowerCase() ?? null}, ${p.ethAddresses.map((a) => a.toLowerCase())}, ${p.primaryEth?.toLowerCase() ?? null},
            ${new Date(opts.nowMs).toISOString()}::timestamptz)
          on conflict (fid) do update set score = excluded.score, registered_at = excluded.registered_at,
            follower_count = excluded.follower_count, following_count = excluded.following_count,
            custody_address = excluded.custody_address, eth_addresses = excluded.eth_addresses,
            primary_eth = excluded.primary_eth, fetched_at = excluded.fetched_at`;
      } catch {
        // cache write failures never block a tip
      }
    }
  }
  return out;
}

const COUNTED = ["sent", "dry_run", "held", "approving"];

function utcDayStart(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export async function riskHistory(
  sql: AnonTipsSql,
  q: {
    nowMs: number;
    senderFid: number;
    recipientFid: number;
    recipientPayout: string;
    senderAddresses: string[];
    recipientAddresses: string[];
    config: TipRiskConfig;
    /** Exclude this tip id (used when re-checking an existing held tip). */
    excludeTipId?: number;
  },
): Promise<TipRiskInput["history"]> {
  const ex = q.excludeTipId ?? -1;
  const ago = (days: number) => new Date(q.nowMs - days * 86_400_000).toISOString();
  const dayStart = utcDayStart(q.nowMs);
  const one = async (p: Promise<{ n: string; a?: string }[]>) => {
    const [r] = await p;
    return { n: Number(r?.n ?? 0), a: Number(r?.a ?? 0) };
  };
  const reciprocal = await one(sql`
    select count(*)::text as n from anon_tips
    where sender_fid = ${q.recipientFid} and recipient_fid = ${q.senderFid} and status = any(${COUNTED})
      and created_at >= ${ago(q.config.reciprocalDays)}::timestamptz and id <> ${ex}`);
  const pair = await one(sql`
    select count(*)::text as n from anon_tips
    where sender_fid = ${q.senderFid} and recipient_fid = ${q.recipientFid} and status = any(${COUNTED})
      and created_at >= ${ago(q.config.pairRepeatDays)}::timestamptz and id <> ${ex}`);
  const recipientToday = await one(sql`
    select count(*)::text as n, coalesce(sum(amount), 0)::text as a from anon_tips
    where recipient_fid = ${q.recipientFid} and status = any(${COUNTED})
      and created_at >= ${dayStart}::timestamptz and id <> ${ex}`);
  const globalToday = await one(sql`
    select count(*)::text as n, coalesce(sum(amount), 0)::text as a from anon_tips
    where status = any(${COUNTED}) and created_at >= ${dayStart}::timestamptz and id <> ${ex}`);
  const burst = await one(sql`
    select count(*)::text as n from anon_tips
    where sender_fid = ${q.senderFid} and status = any(${COUNTED})
      and created_at >= ${new Date(q.nowMs - 3_600_000).toISOString()}::timestamptz and id <> ${ex}`);

  const payout = q.recipientPayout.toLowerCase();
  const senderAddrs = q.senderAddresses.map((a) => a.toLowerCase());
  const recipientAddrs = [...new Set([...q.recipientAddresses.map((a) => a.toLowerCase()), payout])];

  const payoutClaims = await one(sql`
    select count(*)::text as n from faucet_claims
    where lower(address) = ${payout} and (fid = ${q.senderFid} or (fid is null and lower(address) = any(${senderAddrs})))`);
  const reuse = await one(sql`
    select count(*)::text as n from faucet_claims
    where lower(address) = any(${recipientAddrs}) and fid is not null and fid <> ${q.recipientFid}`);
  const sharedIp = await one(sql`
    select count(*)::text as n from (
      select ip_hash from faucet_claims
      where ip_hash not like 'fid:%' and created_at >= ${ago(30)}::timestamptz
        and (fid = ${q.senderFid} or lower(address) = any(${senderAddrs}))
      intersect
      select ip_hash from faucet_claims
      where ip_hash not like 'fid:%' and created_at >= ${ago(30)}::timestamptz
        and (fid = ${q.recipientFid} or lower(address) = any(${recipientAddrs}))
    ) x`).catch(() => ({ n: 0, a: 0 }));

  return {
    reciprocalCount: reciprocal.n,
    pairRepeatCount: pair.n,
    recipientTodayCount: recipientToday.n,
    recipientTodayAmount: recipientToday.a,
    globalTodayCount: globalToday.n,
    globalTodayAmount: globalToday.a,
    senderLastHourCount: burst.n,
    payoutInSenderClaims: payoutClaims.n > 0,
    recipientWalletReuse: reuse.n > 0,
    sharedIpHash: sharedIp.n > 0,
  };
}

export async function assessTipRisk(
  sql: AnonTipsSql,
  fetchProfiles: NeynarFetch,
  q: {
    nowMs: number;
    amount: number;
    claimAmount: number;
    senderFid: number;
    recipientFid: number;
    recipientPayout: string;
    senderAddresses: string[];
    recipientAddresses: string[];
    config: TipRiskConfig;
    excludeTipId?: number;
  },
): Promise<TipRiskResult> {
  const profiles = await cachedProfiles(sql, [q.senderFid, q.recipientFid], fetchProfiles, {
    nowMs: q.nowMs,
    cacheHours: q.config.cacheHours,
  });
  const history = await riskHistory(sql, q);
  return evaluateTipRisk(
    {
      nowMs: q.nowMs,
      amount: q.amount,
      claimAmount: q.claimAmount,
      senderFid: q.senderFid,
      recipientFid: q.recipientFid,
      recipientPayout: q.recipientPayout,
      sender: profiles.get(q.senderFid) ?? null,
      recipient: profiles.get(q.recipientFid) ?? null,
      senderAddresses: q.senderAddresses,
      recipientAddresses: q.recipientAddresses,
      history,
    },
    q.config,
  );
}
