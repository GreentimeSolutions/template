import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/youcog/holder-http.server";
import { domainFromRequest } from "@/lib/youcog/miniapp";

export const Route = createFileRoute("/api/holder-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { message?: string; mac?: string; signature?: string };
          const h = await import("@/lib/youcog/holder.server");
          const address = await h.verifyChallenge({
            message: String(body.message ?? ""),
            mac: String(body.mac ?? ""),
            signature: String(body.signature ?? ""),
            domain: domainFromRequest(request),
          });
          const st = await h.evaluate([address]);
          await h.recordFromStatus(st, "signature");
          if (st.excluded) return json({ holder: false, excluded: true, reason: "The faucet wallet can't use holder perks." });
          return json({ ...st, session: h.issueSession({ kind: "addr", address }) });
        } catch (e) {
          return json({ holder: false, error: e instanceof Error ? e.message : "Verification failed." }, 400);
        }
      },
    },
  },
});
