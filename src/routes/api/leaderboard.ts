import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/leaderboard")({
  server: {
    handlers: {
      GET: async () => {
        const { leaderboard } = await import("@/lib/youcog/faucet.server");
        try {
          return Response.json(await leaderboard(), { headers: { "cache-control": "public, max-age=30, s-maxage=60" } });
        } catch {
          return Response.json({ claimers: [], tippers: [] }, { status: 200, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
