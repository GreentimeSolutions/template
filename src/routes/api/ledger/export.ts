import { createFileRoute } from "@tanstack/react-router";

/**
 * Public NDJSON export of ledger events (?from_seq=0&limit=500, max 1000).
 * Payloads hold salted sender commitments, never sender fids; salts are never exported.
 * `?check=1` adds a server-side chain check line at the end.
 */
export const Route = createFileRoute("/api/ledger/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const from = Number(url.searchParams.get("from_seq") ?? 0) || 0;
          const limit = Number(url.searchParams.get("limit") ?? 500) || 500;
          const { getSql } = await import("@/lib/db");
          const { ledgerExport, ledgerSelfCheck } = await import("@/lib/youcog/ledger.server");
          const { payloadIsRedacted } = await import("@/lib/youcog/ledger-core");
          const sql = await getSql();
          const rows = await ledgerExport(sql, from, limit);
          if (rows.some((r) => !payloadIsRedacted(r.payload))) {
            return Response.json({ ok: false, reason: "export refused: unredacted payload" }, { status: 500 });
          }
          let body = rows.map((r) => JSON.stringify(r)).join("\n");
          if (url.searchParams.get("check") === "1") body += `${body ? "\n" : ""}${JSON.stringify({ check: await ledgerSelfCheck(sql) })}`;
          return new Response(body ? `${body}\n` : "", {
            headers: {
              "content-type": "application/x-ndjson; charset=utf-8",
              "cache-control": "public, max-age=30, s-maxage=30",
              "access-control-allow-origin": "*",
            },
          });
        } catch {
          return Response.json({ ok: false, reason: "Ledger unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
