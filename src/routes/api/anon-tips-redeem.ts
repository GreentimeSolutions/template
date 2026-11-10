import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";
import { redeemGiftPointsStub } from "@/lib/youcog/anon-tips-core";

export const Route = createFileRoute("/api/anon-tips-redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const fid = await quickAuthFid(request);
        if (!fid) return json({ ok: false, reason: "Sign in with Farcaster to check gift points." }, 401);
        // Stub only: a future weekly window is off by default and not implemented here.
        return json(redeemGiftPointsStub());
      },
    },
  },
});
