import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";

const hits = new Map<number, number[]>();
function allow(fid: number) {
  const now = Date.now();
  const h = (hits.get(fid) ?? []).filter((t) => t > now - 60_000);
  if (h.length >= 20) return false;
  h.push(now);
  hits.set(fid, h);
  return true;
}

/** Read-only "Your streak & tips" timeline for the Quick Auth FID only. */
export const Route = createFileRoute("/api/streak-timeline")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fid = await quickAuthFid(request);
        if (!fid) return json({ ok: false, reason: "Sign in with Farcaster to see your streak and tips." }, 401);
        if (!allow(fid)) return json({ ok: false, reason: "Too many requests. Try again in a minute." }, 429);
        const url = new URL(request.url);
        const { timelineCursor, timelineLimit } = await import("@/lib/youcog/streak-timeline-core");
        const limit = timelineLimit(url.searchParams.get("limit"));
        const before = timelineCursor(url.searchParams.get("before"));
        try {
          const { getSql } = await import("@/lib/db");
          const { streakTimeline } = await import("@/lib/youcog/streak-timeline.server");
          const { streakInfo } = await import("@/lib/youcog/faucet.server");
          const sql = await getSql();
          const [timeline, streak] = await Promise.all([
            streakTimeline(sql, fid, { limit, before }),
            before ? Promise.resolve(null) : streakInfo({ fid }).catch(() => null),
          ]);
          return json({ ok: true, fid, streak, ...timeline });
        } catch {
          return json({ ok: false, reason: "Couldn't load your timeline. Try again." }, 200);
        }
      },
    },
  },
});
