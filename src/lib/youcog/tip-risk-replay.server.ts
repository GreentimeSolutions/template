/**
 * Replay the spam checks over recorded tips, as of each tip's own time and using only
 * earlier history. Log-only: the only write is the 1-day Neynar cache (fc_user_cache).
 * One Neynar bulk call covers every fid involved (1 credit per uncached fid).
 */
import type { AnonTipsSql } from "./anon-tips.server.ts";
import { readTipRiskConfig } from "./tip-risk-core.ts";
import { assessTipRisk, cachedProfiles, neynarBulkFetcher } from "./tip-risk.server.ts";

export async function replay(sql: AnonTipsSql, apiKey: string | undefined, claimAmount: number) {
  const config = { ...readTipRiskConfig(process.env), mode: "log" as const };
  const verified = async (fid: number) => {
    try {
      const r = await fetch(`https://api.farcaster.xyz/v2/verifications?fid=${fid}`, { signal: AbortSignal.timeout(5000) });
      const j = (await r.json()) as { result?: { verifications?: { address?: string; protocol?: string }[] } };
      return (j.result?.verifications ?? []).filter((v) => v.protocol !== "solana" && v.address?.startsWith("0x")).map((v) => v.address!);
    } catch {
      return [];
    }
  };
  // Prefetch all profiles in one bulk call so the cache serves every replayed tip.
  const tips = await sql<{ id: number; sender_fid: number; recipient_fid: number; recipient_username: string; recipient_address: string; amount: number; created_at: string }>`
    select id, sender_fid, recipient_fid, recipient_username, recipient_address, amount, created_at::text as created_at from anon_tips order by created_at`;
  const fetchProfiles = neynarBulkFetcher(apiKey);
  await cachedProfiles(sql, [...new Set(tips.flatMap((t) => [Number(t.sender_fid), Number(t.recipient_fid)]))], fetchProfiles, { nowMs: Date.now(), cacheHours: 24 });
  const out = [];
  for (const t of tips) {
    const r = await assessTipRisk(sql, async () => null /* cache only */, {
      nowMs: Date.parse(t.created_at),
      amount: Number(t.amount),
      claimAmount,
      senderFid: Number(t.sender_fid),
      recipientFid: Number(t.recipient_fid),
      recipientPayout: t.recipient_address,
      senderAddresses: await verified(Number(t.sender_fid)),
      recipientAddresses: await verified(Number(t.recipient_fid)),
      config: { ...config, cacheHours: 24 * 365 },
      excludeTipId: Number(t.id),
    });
    out.push({ tipId: Number(t.id), recipient: t.recipient_username, createdAt: t.created_at, outcome: r.outcome, flags: r.flags });
  }
  return out;
}

