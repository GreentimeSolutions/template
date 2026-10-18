import { getAddress, isAddress } from "viem";
import { domainFromRequest } from "@/lib/youcog/miniapp";
import { hashIp } from "@/lib/youcog/faucet.server";
import { listenIdentity } from "@/lib/youcog/listen-core";

export const listenJson = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const hits = new Map<string, number[]>();
/** Small per-instance burst limiter (the DB limits are the real guard). */
export function allowListen(key: string, limit = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

export function requestIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip")?.trim() || "";
}

/**
 * Who is listening, keyed exactly like the faucet keys claims: the verified
 * Farcaster FID (Quick Auth) in the Mini App, or the Base address plus the
 * hashed connection IP on the web.
 */
export async function resolveListenIdentity(
  request: Request,
  address: unknown,
): Promise<{ ok: true; identity: string; ip: string } | { ok: false; status: number; reason: string }> {
  const ip = requestIp(request);
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token) {
    try {
      const { createClient } = await import("@farcaster/quick-auth");
      const payload = await createClient().verifyJwt({
        token,
        domain: process.env.FARCASTER_DOMAIN?.trim() || domainFromRequest(request),
      });
      const fid = Number(payload.sub);
      const identity = listenIdentity({ fid });
      if (!identity) throw new Error("bad sub");
      return { ok: true, identity, ip };
    } catch {
      return { ok: false, status: 401, reason: "Your Farcaster sign-in couldn't be verified. Reopen the app and try again." };
    }
  }
  if (typeof address !== "string" || !isAddress(address.trim(), { strict: false })) {
    return { ok: false, status: 400, reason: "Enter your Base address first, then start the song." };
  }
  if (!ip) return { ok: false, status: 400, reason: "Couldn't verify your connection. Try again later." };
  const identity = listenIdentity({ address: getAddress(address.trim()), ipHash: hashIp(ip) });
  if (!identity) return { ok: false, status: 400, reason: "Couldn't identify this listen." };
  return { ok: true, identity, ip };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
