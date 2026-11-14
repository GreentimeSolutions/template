import { createFileRoute } from "@tanstack/react-router";

/** Public, cached Ghosts remaining, free-window, and current price. */
export const Route = createFileRoute("/api/ghosts-supply")({
  server: {
    handlers: {
      GET: async () => {
        const { readGhostsSupply } = await import("@/lib/youcog/ghosts-supply.server");
        try {
          return Response.json(await readGhostsSupply(), {
            headers: { "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60" },
          });
        } catch {
          return Response.json({ error: "Supply unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
