import { createFileRoute } from "@tanstack/react-router";
import { allowListen as allow, listenJson as json, readJson, requestIp } from "@/lib/youcog/listen-identity.server";
import { quickAuthFid } from "@/lib/youcog/holder-http.server";

/** Same identity the faucet keys on: verified FID (Quick Auth) in the Mini App, or the Base address + connection on the web. */
async function who(request: Request): Promise<{ ok: true; fid?: number; ip: string } | { ok: false; status: number; reason: string }> {
  const ip = requestIp(request);
  const hasToken = (request.headers.get("authorization") ?? "").startsWith("Bearer ");
  if (hasToken) {
    const fid = await quickAuthFid(request);
    if (!fid) return { ok: false, status: 401, reason: "Your Farcaster sign-in couldn't be verified. Reopen the app and try again." };
    return { ok: true, fid, ip };
  }
  return { ok: true, ip };
}

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      /** Has this FID / address already earned the reward? */
      GET: async ({ request }) => {
        const id = await who(request);
        const { FEEDBACK_REWARD_YOUCOG } = await import("@/constants/feedback");
        if (!id.ok) return json(200, { done: false, reward: FEEDBACK_REWARD_YOUCOG });
        if (!allow(`fb-status:${id.fid ?? id.ip}`, 30)) return json(429, { done: false, reward: FEEDBACK_REWARD_YOUCOG });
        const address = new URL(request.url).searchParams.get("address")?.trim() || undefined;
        try {
          const { getSql } = await import("@/lib/db");
          const { feedbackStatus } = await import("@/lib/youcog/feedback.server");
          return json(200, await feedbackStatus(await getSql(), { fid: id.fid, address }));
        } catch {
          return json(200, { done: false, reward: FEEDBACK_REWARD_YOUCOG });
        }
      },
      POST: async ({ request }) => {
        const id = await who(request);
        if (!id.ok) return json(id.status, { ok: false, reason: id.reason });
        // Basic rate limits: per person, per connection, and a global burst cap (the DB uniques are the real guard).
        if (!allow(`fb:${id.fid ?? "web"}:${id.ip}`, 4, 10 * 60_000) || !allow(`fb-ip:${id.ip}`, 8, 10 * 60_000) || !allow("fb-all", 60)) {
          return json(429, { ok: false, reason: "Slow down a little and try again in a few minutes." });
        }
        const body = await readJson(request);
        if (typeof body.website === "string" && body.website) return json(200, { ok: false, reason: "Submission refused." });
        if (JSON.stringify(body).length > 12_000) return json(413, { ok: false, reason: "That's too long. Trim your answers a little." });
        if (!id.fid && !id.ip) return json(400, { ok: false, reason: "Couldn't verify your connection. Try again later." });

        const { dbSource, getSql } = await import("@/lib/db");
        // Anti-farming needs the shared database; never pay from an in-memory fallback on serverless.
        if (dbSource !== "neon" && process.env.VERCEL) {
          return json(200, { ok: false, reason: "Feedback gifts aren't open yet. Check back soon." });
        }
        const { clients, faucetBalances, sendYoucog, hashIp, FAUCET_MIN_GAS_WEI } = await import("@/lib/youcog/faucet.server");
        const { submitFeedback } = await import("@/lib/youcog/feedback.server");
        const c = clients();
        const payer = c
          ? {
              address: c.account.address,
              minGasWei: FAUCET_MIN_GAS_WEI,
              balances: () => faucetBalances(c),
              send: (to: `0x${string}`, wei: bigint) => sendYoucog(c, to, wei),
            }
          : null;
        try {
          const res = await submitFeedback(await getSql(), payer, {
            answers: body.answers,
            address: typeof body.address === "string" ? body.address.slice(0, 100) : "",
            fid: id.fid,
            ipHash: id.fid ? undefined : hashIp(id.ip),
          });
          return json(200, res);
        } catch (err) {
          console.error("[feedback] submit failed:", err instanceof Error ? err.message.slice(0, 200) : err);
          return json(503, { ok: false, reason: "Couldn't save your feedback. Try again in a minute." });
        }
      },
    },
  },
});
