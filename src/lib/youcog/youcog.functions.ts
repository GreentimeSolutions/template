import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
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
    if (!allow("mission", 6, 10 * 60 * 1000)) {
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
