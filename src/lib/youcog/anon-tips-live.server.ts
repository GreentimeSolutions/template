/** Production wiring for anonymous tips: database, Farcaster lookups, faucet wallet, Neynar. */
import { getSql } from "../db";
import { fidAddresses } from "./holder.server";
import { clients, sendYoucog } from "./faucet.server";
import { mentionCount, normalizeUsername, readAnonTipsConfig, recordDryRun, tipsLive } from "./anon-tips-core";
import { quoteFaucetClaim } from "./youcog-price.server";
import { FAUCET_CLAIM_FALLBACK_YOUCOG } from "../../constants/faucet";
import type { AnonTipsDeps, FcUser } from "./anon-tips.server";

export async function lookupUserByUsername(username: string): Promise<FcUser | null> {
  const u = normalizeUsername(username);
  if (!u) return null;
  try {
    const r = await fetch(`https://api.farcaster.xyz/v2/user-by-username?username=${encodeURIComponent(u)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const user = (await r.json())?.result?.user;
    const fid = Number(user?.fid);
    const name = normalizeUsername(String(user?.username ?? u));
    if (!Number.isSafeInteger(fid) || fid <= 0 || !name) return null;
    return { fid, username: name };
  } catch {
    return null;
  }
}

export async function postRecastCast(text: string, embeds?: { url: string }[]): Promise<string | null> {
  const apiKey = process.env.NEYNAR_API_KEY?.trim();
  const signerUuid = process.env.NEYNAR_SIGNER_UUID?.trim();
  if (!apiKey || !signerUuid) {
    console.warn("[anon-tips] Neynar is not configured; skipping cast.");
    return null;
  }
  if (mentionCount(text) !== 1) {
    console.warn("[anon-tips] refusing to post a cast that does not have exactly one mention.");
    return null;
  }
  const body: Record<string, unknown> = { signer_uuid: signerUuid, text, channel_id: "recast" };
  if (embeds?.length) body.embeds = embeds;
  const r = await fetch("https://api.neynar.com/v2/farcaster/cast/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("[anon-tips] Neynar cast failed:", r.status, body.slice(0, 200));
    return null;
  }
  const json = (await r.json().catch(() => null)) as { cast?: { hash?: string } } | null;
  return json?.cast?.hash ?? null;
}

export async function liveAnonTipsDeps(): Promise<AnonTipsDeps> {
  const sql = await getSql();
  const c = clients();
  const claimAmount = await quoteFaucetClaim()
    .then((q) => q.amount)
    .catch(() => FAUCET_CLAIM_FALLBACK_YOUCOG);
  return {
    sql,
    live: tipsLive(),
    persistDryRun: recordDryRun(),
    config: readAnonTipsConfig(process.env, claimAmount),
    lookupUser: lookupUserByUsername,
    addressesFor: fidAddresses,
    sendYoucog: async (to, amountWei) => {
      if (!c) throw new Error("The faucet isn't open yet.");
      return sendYoucog(c, to, amountWei);
    },
    postCast: postRecastCast,
    log: (message, extra) => console.info(message, extra ?? ""),
  };
}
