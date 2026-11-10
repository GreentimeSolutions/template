import { createFileRoute } from "@tanstack/react-router";
import { json, quickAuthFid } from "@/lib/youcog/holder-http.server";

const hits = new Map<string, number[]>();
function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (h.length >= limit) return false;
  h.push(now);
  hits.set(key, h);
  return true;
}

export const Route = createFileRoute("/api/anon-tips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fid = await quickAuthFid(request);
        if (!fid) return json({ ok: false, reason: "Sign in with Farcaster to see your tip balance." }, 401);
        try {
          const { anonTipsStatus } = await import("@/lib/youcog/anon-tips.server");
          const { liveAnonTipsDeps } = await import("@/lib/youcog/anon-tips-live.server");
          return json(await anonTipsStatus(await liveAnonTipsDeps(), fid));
        } catch {
          return json({ ok: false, reason: "Couldn't load tip balance. Try again." }, 200);
        }
      },
      POST: async ({ request }) => {
        const fid = await quickAuthFid(request);
        if (!fid) return json({ ok: false, reason: "Sign in with Farcaster to send a tip." }, 401);
        if (!allow(`tip:${fid}`, 8, 60_000) || !allow("tip:all", 40, 60_000)) {
          return json({ ok: false, reason: "Tips are busy. Try again in a minute." }, 429);
        }
        let body: { username?: unknown; amount?: unknown } = {};
        try {
          body = (await request.json()) as { username?: unknown; amount?: unknown };
        } catch {
          return json({ ok: false, reason: "Enter a username and an amount." }, 400);
        }
        const { sendAnonTip } = await import("@/lib/youcog/anon-tips.server");
        const { liveAnonTipsDeps } = await import("@/lib/youcog/anon-tips-live.server");
        try {
          return json(await sendAnonTip(await liveAnonTipsDeps(), { senderFid: fid, username: body.username, amount: body.amount }));
        } catch {
          return json({ ok: false, reason: "The tip couldn't go through. Try again." }, 200);
        }
      },
    },
  },
});
