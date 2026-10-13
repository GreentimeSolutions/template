import { domainFromRequest } from "@/lib/youcog/miniapp";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Verified FID from a Quick Auth bearer token, if any. */
export async function quickAuthFid(request: Request): Promise<number | undefined> {
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

export async function holderFromRequest(request: Request) {
  const { statusForSession } = await import("@/lib/youcog/holder.server");
  const fid = await quickAuthFid(request);
  const session = request.headers.get("x-holder-session");
  return statusForSession(session, fid);
}
