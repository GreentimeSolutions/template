import { createFileRoute } from "@tanstack/react-router";
import { holderFromRequest, json } from "@/lib/youcog/holder-http.server";

/** GET: holder status for a Quick Auth FID (Mini App) or an x-holder-session from a signed message (web). */
export const Route = createFileRoute("/api/holder")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const st = await holderFromRequest(request);
          return json({ holder: st.holder, address: st.address, balance: st.balance, min: st.min, excluded: st.excluded ?? false, verified: !!st.who });
        } catch {
          return json({ holder: false, verified: false, reason: "Couldn't check holdings right now." });
        }
      },
    },
  },
});
