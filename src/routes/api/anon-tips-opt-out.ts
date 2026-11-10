import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";

export const Route = createFileRoute("/api/anon-tips-opt-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const fid = await quickAuthFid(request);
        if (!fid) return json({ ok: false, reason: "Sign in with Farcaster to change tip settings." }, 401);
        let optOut = true;
        try {
          const body = (await request.json()) as { optOut?: unknown };
          if (body.optOut === false || body.optOut === "false") optOut = false;
        } catch {
          /* default: opt out */
        }
        const { setTipOptOut } = await import("@/lib/youcog/anon-tips.server");
        const { liveAnonTipsDeps } = await import("@/lib/youcog/anon-tips-live.server");
        try {
          return json(await setTipOptOut(await liveAnonTipsDeps(), fid, optOut));
        } catch {
          return json({ ok: false, reason: "Couldn't update that setting. Try again." }, 200);
        }
      },
    },
  },
});
