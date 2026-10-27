import { createFileRoute } from "@tanstack/react-router";
import { getAddress, isAddress } from "viem";
import { fidFromRequest } from "./streak";

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const hits = new Map<string, number[]>();
function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (h.length >= limit) return false;
  h.push(now);
  hits.set(key, h);
  return true;
}

/** Verified FID in the Mini App (Quick Auth); otherwise the Base address the web user typed. */
async function who(request: Request, address: unknown) {
  const fid = await fidFromRequest(request);
  if (fid) return { fid };
  const a = typeof address === "string" ? address.trim() : "";
  return a && isAddress(a, { strict: false }) ? { address: getAddress(a) } : null;
}

export const Route = createFileRoute("/api/save-bonus")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const w = await who(request, new URL(request.url).searchParams.get("address"));
        if (!w) return json(200, { open: false });
        try {
          const { saveBonusStatus } = await import("@/lib/youcog/save-bonus.server");
          const { liveSaveBonusStatusDeps } = await import("@/lib/youcog/save-bonus-live.server");
          return json(200, await saveBonusStatus(await liveSaveBonusStatusDeps(), w));
        } catch {
          return json(200, { open: false });
        }
      },
      POST: async ({ request }) => {
        let body: { address?: unknown } = {};
        try {
          body = (await request.json()) as { address?: unknown };
        } catch {
          /* fid path needs no body */
        }
        const w = await who(request, body.address);
        if (!w) return json(400, { ok: false, reason: "Enter the Base address you claimed with." });
        const key = "fid" in w ? `fid:${w.fid}` : `addr:${w.address.toLowerCase()}`;
        if (!allow(`save:${key}`, 3, 60_000) || !allow("save:all", 30, 60_000)) {
          return json(429, { ok: false, reason: "The save bonus is busy. Try again in a minute." });
        }
        const { claimSaveBonus } = await import("@/lib/youcog/save-bonus.server");
        const { liveSaveBonusDeps } = await import("@/lib/youcog/save-bonus-live.server");
        const deps = await liveSaveBonusDeps();
        if (!deps) return json(200, { ok: false, reason: "The save bonus isn't open yet." });
        return json(200, await claimSaveBonus(deps, w));
      },
    },
  },
});
