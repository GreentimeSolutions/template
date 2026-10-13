import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stats")({
  server: {
    handlers: {
      GET: async () => {
        const { stats } = await import("@/lib/youcog/faucet.server");
        try {
          return Response.json(await stats(), {
            headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120", "access-control-allow-origin": "*" },
          });
        } catch {
          return Response.json({ error: "Stats unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
