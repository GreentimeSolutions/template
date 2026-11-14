import { createFileRoute } from "@tanstack/react-router";
import { decodeLabOutfit, parseTraitsParam, parseWearParam, traitsToOutfit } from "@/lib/youcog/ghost-lab-core";
import { parseGhostPx, renderGhostPng } from "@/lib/youcog/ghost-png";

/** Public PNG of a Lab ghost from on-chain traits and/or contest-only wear ids. */
export const Route = createFileRoute("/api/ghost-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const px = parseGhostPx(url.searchParams.get("px"));
        const wear = url.searchParams.get("wear");
        const traitsRaw = url.searchParams.get("traits");
        const encoded = url.searchParams.get("ghost");
        const outfit = wear
          ? parseWearParam(wear)
          : traitsRaw
            ? (() => {
                const t = parseTraitsParam(traitsRaw);
                return t ? traitsToOutfit(t) : null;
              })()
            : encoded
              ? decodeLabOutfit(encoded)
              : null;
        if (!outfit) {
          return Response.json({ error: "Unknown or invalid ghost traits" }, { status: 400, headers: { "cache-control": "no-store" } });
        }
        try {
          const png = renderGhostPng(outfit, { px, t: 0 });
          return new Response(png, {
            headers: {
              "content-type": "image/png",
              "content-disposition": 'inline; filename="youcog-ghost.png"',
              "cache-control": "public, max-age=86400, immutable",
            },
          });
        } catch (e) {
          console.error("[ghost-image] render failed", e);
          return Response.json({ error: "Could not render that ghost" }, { status: 500, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
