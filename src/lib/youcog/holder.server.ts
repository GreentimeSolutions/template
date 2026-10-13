import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseAbi, parseUnits } from "viem";
import { base } from "viem/chains";
import { getSql } from "@/lib/db";

export const TOKEN = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3" as const;
/** The faucet wallet holds the faucet supply; it never qualifies for perks. */
export const FAUCET_WALLET = "0x3067ab541253746AB353b842Fdc0970ffBDe13c7";
const ERC20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const SESSION_TTL_MS = 24 * 3600_000;
const NONCE_TTL_MS = 10 * 60_000;

export function holderMin(): number {
  const n = Number(process.env.HOLDER_MIN_YOUCOG);
  return Number.isFinite(n) && n > 0 ? n : 10_000_000;
}

function secret(): string {
  const s = process.env.HOLDER_SESSION_SECRET?.trim() || process.env.FAUCET_IP_SALT?.trim();
  if (!s) throw new Error("Holder perks aren't configured.");
  return `holder:${s}`;
}
const mac = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");
function macOk(data: string, sig: string) {
  const a = Buffer.from(mac(data));
  const b = Buffer.from(String(sig));
  return a.length === b.length && timingSafeEqual(a, b);
}

function pub() {
  return createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org") });
}

export function isFaucet(address: string) {
  return address.toLowerCase() === FAUCET_WALLET.toLowerCase();
}

const balCache = new Map<string, { at: number; bal: bigint }>();
async function balanceOf(address: `0x${string}`): Promise<bigint> {
  const hit = balCache.get(address);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.bal;
  const bal = await pub().readContract({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [address] });
  balCache.set(address, { at: Date.now(), bal });
  return bal;
}

export type HolderStatus = {
  holder: boolean;
  address: string | null;
  balance: number;
  min: number;
  excluded?: boolean;
};

/** Best qualifying address among proven-owned ones; the faucet wallet is excluded. */
export async function evaluate(addresses: string[]): Promise<HolderStatus> {
  const min = holderMin();
  const minWei = parseUnits(String(min), 18);
  let best: { address: string; bal: bigint } | null = null;
  let excluded = false;
  for (const raw of addresses) {
    if (!isAddress(raw, { strict: false })) continue;
    const a = getAddress(raw);
    if (isFaucet(a)) {
      excluded = true;
      continue;
    }
    const bal = await balanceOf(a);
    if (!best || bal > best.bal) best = { address: a, bal };
  }
  return {
    holder: !!best && best.bal >= minWei,
    address: best?.address ?? null,
    balance: best ? Number(formatUnits(best.bal, 18)) : 0,
    min,
    ...(excluded ? { excluded: true } : {}),
  };
}

// ---- Web: signed-message proof (SIWE-style) ----
export function issueChallenge(address: string, domain: string) {
  if (!isAddress(address, { strict: false })) throw new Error("Bad address.");
  const a = getAddress(address);
  const message = [
    `${domain} wants you to prove you own this wallet to unlock YOUCOG holder perks.`,
    "",
    `Address: ${a}`,
    `Nonce: ${randomBytes(12).toString("hex")}`,
    `Issued At: ${new Date().toISOString()}`,
    "Chain ID: 8453",
    "This signature costs nothing and sends no transaction.",
  ].join("\n");
  return { message, mac: mac(message) };
}

export async function verifyChallenge(input: { message: string; mac: string; signature: string; domain: string }) {
  if (!macOk(input.message, input.mac)) throw new Error("That sign-in request wasn't issued by Youcognito.");
  if (!input.message.startsWith(`${input.domain} wants you`)) throw new Error("Wrong domain.");
  const address = input.message.match(/^Address: (0x[0-9a-fA-F]{40})$/m)?.[1];
  const issued = input.message.match(/^Issued At: (.+)$/m)?.[1];
  if (!address || !issued) throw new Error("Malformed sign-in request.");
  if (Date.now() - Date.parse(issued) > NONCE_TTL_MS) throw new Error("Sign-in request expired. Try again.");
  // Supports EOAs and smart wallets (ERC-1271 / ERC-6492) via the public client.
  const ok = await pub().verifyMessage({
    address: address as `0x${string}`,
    message: input.message,
    signature: input.signature as `0x${string}`,
  });
  if (!ok) throw new Error("Signature didn't match that wallet.");
  return getAddress(address);
}

// ---- Mini App: Farcaster verified addresses ----
export async function fidAddresses(fid: number): Promise<string[]> {
  const r = await fetch(`https://api.farcaster.xyz/v2/verifications?fid=${fid}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return [];
  const list = (await r.json())?.result?.verifications ?? [];
  return list
    .filter((v: { protocol?: string; address?: string }) => v.protocol === "ethereum" && v.address)
    .map((v: { address: string }) => v.address);
}

// ---- Session tokens (stateless, HMAC) ----
type Session = { kind: "addr"; address: string; exp: number } | { kind: "fid"; fid: number; exp: number };
export function issueSession(s: { kind: "addr"; address: string } | { kind: "fid"; fid: number }) {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${body}.${mac(body)}`;
}
function readSession(token: string): Session | null {
  const [body, sig] = String(token).split(".");
  if (!body || !sig || !macOk(body, sig)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Re-check holder status for a session (balance can change, so always re-read, with 5 min cache). */
export async function statusForSession(token: string | null | undefined, fid?: number): Promise<HolderStatus & { who: string | null }> {
  let addrs: string[] = [];
  let who: string | null = null;
  let resolvedFid: number | undefined = fid;
  if (!resolvedFid && token) {
    const s = readSession(token);
    if (s?.kind === "addr") {
      addrs = [s.address];
      who = s.address;
    } else if (s?.kind === "fid") resolvedFid = s.fid;
  }
  if (resolvedFid) {
    addrs = await fidAddresses(resolvedFid);
    who = `fid:${resolvedFid}`;
  }
  if (!addrs.length) return { holder: false, address: null, balance: 0, min: holderMin(), who: null };
  const st = await evaluate(addrs);
  await record(st, resolvedFid, resolvedFid ? "fid" : "signature").catch(() => undefined);
  return { ...st, who };
}

async function record(st: HolderStatus, fid: number | undefined, method: string) {
  if (!st.address) return;
  const sql = await getSql();
  await sql`insert into holders (address, fid, balance, is_holder, method, verified_at)
    values (${st.address}, ${fid ?? null}, ${st.balance}, ${st.holder}, ${method}, now())
    on conflict (address) do update set fid = coalesce(excluded.fid, holders.fid), balance = excluded.balance,
      is_holder = excluded.is_holder, method = excluded.method, verified_at = now()`;
}

export async function recordFromStatus(st: HolderStatus, method: "signature") {
  await record(st, undefined, method).catch(() => undefined);
}
