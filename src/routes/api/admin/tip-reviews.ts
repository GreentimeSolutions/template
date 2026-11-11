import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";

/** Held-tip review for admins only (ADMIN_FIDS, default 209707). Quick Auth required. */
async function adminFid(request: Request): Promise<number | null> {
  const fid = await quickAuthFid(request);
  const { isAdminFid, readTipRiskConfig } = await import("@/lib/youcog/tip-risk-core");
  return fid && isAdminFid(fid, readTipRiskConfig(process.env)) ? fid : null;
}

export const Route = createFileRoute("/api/admin/tip-reviews")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fid = await adminFid(request);
        if (!fid) return json({ ok: false, reason: "Admins only." }, 403);
        const { getSql } = await import("@/lib/db");
        const { listReviewQueue } = await import("@/lib/youcog/anon-tips-review.server");
        return json(await listReviewQueue(await getSql()));
      },
      POST: async ({ request }) => {
        const fid = await adminFid(request);
        if (!fid) return json({ ok: false, reason: "Admins only." }, 403);
        let body: { tipId?: unknown; action?: unknown; note?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ ok: false, reason: "Send { tipId, action }." }, 400);
        }
        const tipId = Number(body.tipId);
        const note = typeof body.note === "string" ? body.note.slice(0, 280) : null;
        if (!Number.isSafeInteger(tipId) || tipId <= 0) return json({ ok: false, reason: "Bad tipId." }, 400);
        const r = await import("@/lib/youcog/anon-tips-review.server");
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        switch (body.action) {
          case "approve": {
            const { liveAnonTipsDeps } = await import("@/lib/youcog/anon-tips-live.server");
            return json(await r.approveHeldTip(await liveAnonTipsDeps(), tipId, fid));
          }
          case "reject":
            return json(await r.rejectHeldTip(sql, tipId, fid, note));
          case "void_points":
            return json(await r.voidPendingPoints(sql, tipId, fid, note));
          case "release_points":
            return json(await r.releasePendingPoints(sql, tipId, `admin:${fid}`));
          default:
            return json({ ok: false, reason: "action must be approve | reject | void_points | release_points" }, 400);
        }
      },
    },
  },
});
