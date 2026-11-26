import { createFileRoute } from "@tanstack/react-router";

/** Public, cached Zombie Lab cards remaining on Base. */
export const Route = createFileRoute("/api/zombie-lab-supply")({
  server: {
    handlers: {
      GET: async () => {
        const { readZombieLabSupply } = await import("@/lib/youcog/zombie-lab-supply.server");
        try {
          return Response.json(await readZombieLabSupply(), {
            headers: { "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60" },
          });
        } catch {
          return Response.json({ error: "Supply unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
