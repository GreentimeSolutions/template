import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";

/**
 * Log-only replay of the spam checks over recorded tips (what log mode would have flagged).
 * Admins (Quick Auth, ADMIN_FIDS) or `Authorization: Bearer $CRON_SECRET`. Writes only the Neynar cache.
 */
export const Route = createFileRoute("/api/admin/tip-risk-replay")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { cronAuthorized } = await import("@/lib/youcog/cron-auth.server");
        let allowed = cronAuthorized(request);
        if (!allowed) {
          const fid = await quickAuthFid(request);
          const { isAdminFid, readTipRiskConfig } = await import("@/lib/youcog/tip-risk-core");
          allowed = Boolean(fid && isAdminFid(fid, readTipRiskConfig(process.env)));
        }
        if (!allowed) return json({ ok: false, reason: "Admins only." }, 403);
        const { getSql } = await import("@/lib/db");
        const { replay } = await import("@/lib/youcog/tip-risk-replay.server");
        const { quoteFaucetClaim } = await import("@/lib/youcog/youcog-price.server");
        const claim = await quoteFaucetClaim().then((q) => q.amount).catch(() => 215225);
        const sql = await getSql();
        const tips = await replay(sql, process.env.NEYNAR_API_KEY?.trim(), claim);
        const profiles = await sql`
          select fid, score::text as score, registered_at::date::text as registered, follower_count, following_count,
            cardinality(eth_addresses) as eth_addresses, fetched_at::text as fetched_at
          from fc_user_cache order by fid`;
        return json({ ok: true, claimAmount: claim, tips, profiles });
      },
    },
  },
});
