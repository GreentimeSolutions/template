import { getAddress, isAddress, parseAbi, parseEther, parseUnits } from "viem";
import { getSql } from "@/lib/db";
import { DATA_SUFFIX } from "@/lib/youcog/builder-code";
import { clients } from "@/lib/youcog/faucet.server";
import { fidAddresses } from "@/lib/youcog/holder.server";

export const RCST = "0xcd74cb0455be5bc8316c4c84864988ba9e5631ce" as const;
export const LAUNCH_CAST = {
  url: "https://farcaster.xyz/greentime1/0xa5ad5505",
  username: "greentime1",
  shortHash: "0xa5ad5505",
  fid: 209707,
};
const API = "https://api.farcaster.xyz";
const MIN_GAS_WEI = parseEther("0.000002");
const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export function rcstAmount(): number {
  const n = Number(process.env.RCST_CLAIM_AMOUNT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1111;
}
function dailyCap(): number {
  const n = Number(process.env.RCST_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

type ApiCast = {
  hash: string;
  author: { fid: number; username?: string };
  text?: string;
  channel?: { key?: string };
  embeds?: { casts?: { hash?: string; author?: { fid?: number } }[]; urls?: { openGraph?: { url?: string } }[] };
};

/** Parse farcaster.xyz / warpcast.com cast links: https://farcaster.xyz/<username>/0x<hash>. */
export function parseCastUrl(raw: string): { username: string; hash: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (!["farcaster.xyz", "warpcast.com"].includes(host)) return null;
  const m = u.pathname.match(/^\/([a-z0-9][a-z0-9_.-]{0,40})\/(0x[0-9a-f]{8,40})\/?$/i);
  if (!m || m[1] === "~") return null;
  return { username: m[1].toLowerCase(), hash: m[2].toLowerCase() };
}

/** Resolve a cast (short or full hash) through the public Farcaster client API. */
export async function resolveCast(username: string, hash: string): Promise<ApiCast | null> {
  const q = new URLSearchParams({ castHashPrefix: hash.slice(0, 10), username, limit: "15" });
  const r = await fetch(`${API}/v2/user-thread-casts?${q}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const casts: ApiCast[] = (await r.json())?.result?.casts ?? [];
  return (
    casts.find(
      (c) => c.hash?.toLowerCase().startsWith(hash) && c.author?.username?.toLowerCase() === username,
    ) ?? null
  );
}

let launchHash: string | null = null;
export async function launchCastHash(): Promise<string> {
  if (launchHash) return launchHash;
  const c = await resolveCast(LAUNCH_CAST.username, LAUNCH_CAST.shortHash);
  if (!c || c.author.fid !== LAUNCH_CAST.fid) throw new Error("Couldn't resolve the launch cast.");
  launchHash = c.hash.toLowerCase();
  return launchHash;
}

export type QuoteCheck =
  | { ok: true; castHash: string; fid: number; channel: string | null }
  | { ok: false; reason: string };

/** Verify a link is a quote cast of the launch cast, authored by `fid` (when given). */
export async function checkQuote(link: string, fid?: number): Promise<QuoteCheck> {
  const parsed = parseCastUrl(link);
  if (!parsed) return { ok: false, reason: "Paste a Farcaster cast link like https://farcaster.xyz/you/0x1234abcd." };
  let cast: ApiCast | null;
  let launch: string;
  try {
    [cast, launch] = await Promise.all([resolveCast(parsed.username, parsed.hash), launchCastHash()]);
  } catch {
    return { ok: false, reason: "Couldn't reach Farcaster. Try again in a minute." };
  }
  if (!cast) return { ok: false, reason: "Couldn't find that cast. Check the link." };
  const hash = cast.hash.toLowerCase();
  if (hash === launch) return { ok: false, reason: "That's the launch cast itself. Quote-cast it, then paste your quote's link." };
  const quoted = (cast.embeds?.casts ?? []).some((e) => e.hash?.toLowerCase() === launch);
  if (!quoted) return { ok: false, reason: "That cast doesn't quote the launch cast." };
  if (fid != null && cast.author.fid !== fid) return { ok: false, reason: "That quote-cast was posted by a different account." };
  return { ok: true, castHash: hash, fid: cast.author.fid, channel: cast.channel?.key ?? null };
}

export type RcstResult = { ok: true; amount: number; txHash: string; url: string; channel: string | null } | { ok: false; reason: string };
const refuse = (reason: string): RcstResult => ({ ok: false, reason });

export async function claimRcst(input: { fid: number; link: string; address?: string }): Promise<RcstResult> {
  const c = clients();
  if (!c) return refuse("The RCST claim isn't open yet.");
  const sql = await getSql();
  const [already] = await sql`select 1 from rcst_claims where fid = ${input.fid} and status <> 'failed' limit 1`;
  if (already) return refuse("Your Farcaster account already claimed RCST. It's one claim per account.");

  const q = await checkQuote(input.link, input.fid);
  if (!q.ok) return refuse(q.reason);

  // Payout must go to one of the FID's verified Ethereum addresses.
  const verified = (await fidAddresses(input.fid).catch(() => [])).map((a) => getAddress(a));
  if (!verified.length) return refuse("Verify an Ethereum address on your Farcaster account first.");
  let address = verified[0];
  if (input.address) {
    if (!isAddress(input.address, { strict: false })) return refuse("That isn't a valid Base address.");
    const want = getAddress(input.address);
    if (!verified.includes(want)) return refuse("Payout must go to a wallet verified on your Farcaster account.");
    address = want;
  }
  if (address.toLowerCase() === c.account.address.toLowerCase()) return refuse("The faucet can't send to itself.");

  const amount = rcstAmount();
  const amountWei = parseUnits(String(amount), 18);
  try {
    const [eth, bal] = await Promise.all([
      c.pub.getBalance({ address: c.account.address }),
      c.pub.readContract({ address: RCST, abi: ERC20, functionName: "balanceOf", args: [c.account.address] }),
    ]);
    if (eth < MIN_GAS_WEI) return refuse("The faucet is out of gas (ETH). Try again after it's topped up.");
    if (bal < amountWei) return refuse("The RCST pool is empty. Thanks for quoting!");
  } catch {
    return refuse("Couldn't reach the Base network. Try again in a minute.");
  }

  const day = new Date().toISOString().slice(0, 10);
  const bumped = await sql`
    insert into rcst_days (day, claims) values (${day}, 1)
    on conflict (day) do update set claims = rcst_days.claims + 1
    where rcst_days.claims < ${dailyCap()} returning claims`;
  if (!bumped.length) return refuse("Today's RCST claims are all used. Come back after midnight UTC.");
  const release = () => sql`update rcst_days set claims = claims - 1 where day = ${day}`;

  let id: number;
  try {
    const rows = await sql<{ id: number }>`
      insert into rcst_claims (day, fid, address, cast_hash, channel, amount)
      values (${day}, ${input.fid}, ${address}, ${q.castHash}, ${q.channel}, ${amount}) returning id`;
    id = rows[0].id;
  } catch {
    await release();
    return refuse("This account, wallet or cast already claimed RCST.");
  }
  try {
    const txHash = await c.wallet.writeContract({
      address: RCST,
      abi: ERC20,
      functionName: "transfer",
      args: [address, amountWei],
      dataSuffix: DATA_SUFFIX,
    });
    await sql`update rcst_claims set status = 'sent', tx_hash = ${txHash} where id = ${id}`;
    return { ok: true, amount, txHash, url: `https://basescan.org/tx/${txHash}`, channel: q.channel };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "send failed";
    await sql`update rcst_claims set status = 'failed', error = ${msg} where id = ${id}`;
    await release();
    return refuse("The transfer didn't go through. Nothing was used up, so you can try again.");
  }
}

export async function rcstStats() {
  const sql = await getSql();
  const [r] = await sql<{ n: string; total: string; channel: string }>`
    select count(*)::text as n, coalesce(sum(amount), 0)::text as total,
      count(*) filter (where channel = 'recast')::text as channel
    from rcst_claims where status = 'sent'`;
  return { claims: Number(r.n), distributed: Number(r.total), inRecastChannel: Number(r.channel) };
}
