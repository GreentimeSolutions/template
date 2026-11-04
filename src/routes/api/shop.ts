import { createFileRoute } from "@tanstack/react-router";

/** Ghost Shop. GET ?address= -> owned cosmetics. POST {address,itemId,txHash} -> verify YOUCOG transfer on Base, record. */
export const Route = createFileRoute("/api/shop")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const h = { "cache-control": "no-store" };
        if (process.env.VITE_GHOST_LAB !== "1") return Response.json({ error: "not enabled" }, { status: 404, headers: h });
        const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
        const { isAddr } = await import("@/lib/youcog/shop-verify-core");
        if (!isAddr(address)) return Response.json({ ok: false, error: "Bad wallet address." }, { status: 400, headers: h });
        try {
          const [{ getSql }, { ownedItems }] = await Promise.all([import("@/lib/db"), import("@/lib/youcog/shop.server")]);
          return Response.json({ ok: true, owned: await ownedItems(await getSql(), address) }, { headers: h });
        } catch { return Response.json({ ok: false, error: "Couldn't load your items right now." }, { status: 503, headers: h }); }
      },
      POST: async ({ request }) => {
        const h = { "cache-control": "no-store" };
        if (process.env.VITE_GHOST_LAB !== "1") return Response.json({ error: "not enabled" }, { status: 404, headers: h });
        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return Response.json({ ok: false, code: "bad-input", error: "Bad request body." }, { status: 400, headers: h }); }
        try {
          const { recordPurchase } = await import("@/lib/youcog/shop.server");
          const r = await recordPurchase({ address: body?.address, itemId: body?.itemId, txHash: body?.txHash });
          return Response.json(r.body, { status: r.status, headers: h });
        } catch { return Response.json({ ok: false, code: "server", error: "Couldn't verify right now. Try again." }, { status: 503, headers: h }); }
      },
    },
  },
});
