import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const missionSchema = z.object({
  mission: z.string().trim().min(2).max(400),
});

const urlSchema = z.object({
  url: z.string().trim().min(4).max(2000),
});

const buckets = new Map<string, number[]>();

function allow(bucket: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(bucket) ?? []).filter((stamp) => stamp > now - windowMs);
  if (hits.length >= limit) {
    buckets.set(bucket, hits);
    return false;
  }
  hits.push(now);
  buckets.set(bucket, hits);
  return true;
}

function noStore() {
  setResponseHeader("cache-control", "no-store");
}

export const runMission = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = missionSchema.safeParse(input);
    if (!parsed.success) throw new Error("Write a short mission, at least a few words.");
    return parsed.data;
  })
  .handler(async ({ data }) => {
    noStore();
    // Per-visitor limit (was a single bucket shared by every user), plus a global safety cap.
    const ip = clientIp() || "anon";
    if (!allow(`mission:${ip}`, 8, 10 * 60 * 1000) || !allow("mission:all", 120, 10 * 60 * 1000)) {
      throw new Error("Youcog is resting. Try again in a few minutes.");
    }
    const { runMissionOnServer } = await import("./agent.server");
    return runMissionOnServer(data.mission);
  });

export const readSealedPage = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = urlSchema.safeParse(input);
    if (!parsed.success) throw new Error("That address cannot be sealed.");
    return parsed.data;
  })
  .handler(async ({ data }) => {
    noStore();
    if (!allow("read", 24, 10 * 60 * 1000)) {
      throw new Error("The sealed reader is resting. Try again in a few minutes.");
    }
    const { readPublicPage } = await import("./reader.server");
    return readPublicPage(data.url);
  });

const claimSchema = z.object({
  address: z.string().trim().min(1).max(100),
  amount: z.union([z.literal(420), z.literal(1111), z.literal(6969)]),
  website: z.string().max(200).optional(), // honeypot: humans never fill this
});

function clientIp(): string {
  const fwd = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || getRequestHeader("x-real-ip")?.trim() || "";
}

export const claimFaucet = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = claimSchema.safeParse(input);
    if (!parsed.success) throw new Error("Pick 420, 1111, or 6969 YOUCOG and enter a Base address.");
    return parsed.data;
  })
  .handler(async ({ data }) => {
    noStore();
    if (data.website) return { ok: false as const, reason: "Claim refused." };
    if (!allow("faucet", 30, 60 * 1000)) {
      return { ok: false as const, reason: "The faucet is busy. Try again in a minute." };
    }
    const { claimFromFaucet } = await import("./faucet.server");
    return claimFromFaucet({ address: data.address, amount: data.amount, ip: clientIp() });
  });
