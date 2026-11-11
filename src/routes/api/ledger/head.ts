import { createFileRoute } from "@tanstack/react-router";

/** Public: current ledger head + last on-chain anchor. */
export const Route = createFileRoute("/api/ledger/head")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getSql } = await import("@/lib/db");
          const { ledgerHead } = await import("@/lib/youcog/ledger.server");
          return Response.json(await ledgerHead(await getSql()), {
            headers: { "cache-control": "public, max-age=30, s-maxage=30", "access-control-allow-origin": "*" },
          });
        } catch {
          return Response.json({ ok: false, reason: "Ledger unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
