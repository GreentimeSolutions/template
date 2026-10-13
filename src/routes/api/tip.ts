import { createFileRoute } from "@tanstack/react-router";
import { fidFromRequest } from "./streak";

export const Route = createFileRoute("/api/tip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let hash = "";
        try {
          hash = String((await request.json())?.hash ?? "");
        } catch {
          /* bad body */
        }
        const fid = await fidFromRequest(request);
        const { recordTip } = await import("@/lib/youcog/faucet.server");
        try {
          return Response.json(await recordTip(hash, fid), { headers: { "cache-control": "no-store" } });
        } catch {
          return Response.json({ ok: false, reason: "Couldn't record tip." }, { headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
