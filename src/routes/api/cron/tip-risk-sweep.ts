import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/youcog/holder-http.server";

/** Daily: expire held tips after 7 days, release points whose 7-day hold ended. No-op unless TIPS_RISK_MODE=enforce. */
export const Route = createFileRoute("/api/cron/tip-risk-sweep")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { cronAuthorized } = await import("@/lib/youcog/cron-auth.server");
        if (!cronAuthorized(request)) return json({ ok: false, reason: "unauthorized" }, 401);
        const { readTipRiskConfig } = await import("@/lib/youcog/tip-risk-core");
        const config = readTipRiskConfig(process.env);
        if (config.mode !== "enforce") return json({ ok: true, skipped: `mode ${config.mode}` });
        const { getSql } = await import("@/lib/db");
        const { sweepTipReviews } = await import("@/lib/youcog/anon-tips-review.server");
        return json(await sweepTipReviews(await getSql(), Date.now(), config));
      },
    },
  },
});
