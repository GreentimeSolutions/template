import { createFileRoute } from "@tanstack/react-router";
import { fidFromRequest } from "./streak";

/** GET (read-only): Forge quest signals for a Quick Auth FID or ?address=. Behind VITE_GHOST_LAB. */
export const Route = createFileRoute("/api/quests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const h = { "cache-control": "no-store" };
        if (process.env.VITE_GHOST_LAB !== "1") return Response.json({ error: "not enabled" }, { status: 404, headers: h });
        const fid = await fidFromRequest(request);
        const address = new URL(request.url).searchParams.get("address")?.trim() || undefined;
        try {
          const { questSignals } = await import("@/lib/youcog/quests.server");
          return Response.json({ ok: true, fid: fid ?? null, ...(await questSignals(fid ? { fid } : { address })) }, { headers: h });
        } catch {
          return Response.json({ ok: false, error: "Couldn't read quest progress right now." }, { status: 200, headers: h });
        }
      },
    },
  },
});
