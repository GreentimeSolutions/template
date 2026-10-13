import { createFileRoute } from "@tanstack/react-router";
import { domainFromRequest } from "@/lib/youcog/miniapp";

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function fidFromRequest(request: Request): Promise<number | undefined> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return undefined;
  try {
    const { createClient } = await import("@farcaster/quick-auth");
    const payload = await createClient().verifyJwt({ token, domain: process.env.FARCASTER_DOMAIN?.trim() || domainFromRequest(request) });
    const fid = Number(payload.sub);
    return Number.isSafeInteger(fid) && fid > 0 ? fid : undefined;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/api/streak")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fid = await fidFromRequest(request);
        const address = new URL(request.url).searchParams.get("address")?.trim() || undefined;
        const { streakInfo } = await import("@/lib/youcog/faucet.server");
        try {
          return json(200, { fid: fid ?? null, ...(await streakInfo(fid ? { fid } : { address })) });
        } catch {
          return json(200, { fid: fid ?? null, streak: 0, claimedToday: false, nextStreak: 1, nextMultiplier: 1 });
        }
      },
    },
  },
});
