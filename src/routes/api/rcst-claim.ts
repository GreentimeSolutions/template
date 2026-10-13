import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";

/** POST {link, address?} with Quick Auth bearer. GET ?link= checks a link without claiming (no FID match). */
export const Route = createFileRoute("/api/rcst-claim")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const link = new URL(request.url).searchParams.get("link") ?? "";
        const { checkQuote } = await import("@/lib/youcog/rcst.server");
        return json(await checkQuote(link));
      },
      POST: async ({ request }) => {
        const fid = await quickAuthFid(request);
        if (!fid) return json({ ok: false, reason: "Open Youcognito in Farcaster to claim RCST." }, 401);
        let body: { link?: string; address?: string } = {};
        try {
          body = await request.json();
        } catch {
          /* empty */
        }
        if (!body.link || body.link.length > 300) return json({ ok: false, reason: "Paste your quote-cast link." }, 400);
        const { claimRcst } = await import("@/lib/youcog/rcst.server");
        return json(await claimRcst({ fid, link: body.link, address: body.address?.trim() || undefined }));
      },
    },
  },
});
