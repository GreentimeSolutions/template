import { DATA_SUFFIX } from "@/lib/youcog/builder-code";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  isAddress,
  parseAbi,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { dbSource, getSql } from "@/lib/db";

export const TOKEN = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3" as const;
export const AMOUNTS = [420, 1111, 6969] as const;
const MIN_GAS_WEI = parseEther("0.000002");
const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export type ClaimResult =
  | { ok: true; amount: number; txHash: string; url: string }
  | { ok: false; reason: string };

const refuse = (reason: string): ClaimResult => ({ ok: false, reason });

function dailyCap(): number {
  const n = Number(process.env.FAUCET_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashIp(ip: string): string {
  const salt = process.env.FAUCET_IP_SALT ?? "youcog-faucet";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function clients() {
  const raw = process.env.FAUCET_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  const account = privateKeyToAccount(key);
  const transport = http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org");
  return {
    account,
    pub: createPublicClient({ chain: base, transport }),
    wallet: createWalletClient({ account, chain: base, transport, dataSuffix: DATA_SUFFIX }),
  };
}

export async function claimFromFaucet(input: {
  address: string;
  amount: number;
  ip: string;
  /** Verified Farcaster FID (Quick Auth). When set, the per-FID limit replaces the per-IP limit. */
  fid?: number;
}): Promise<ClaimResult> {
  if (!(AMOUNTS as readonly number[]).includes(input.amount)) {
    return refuse("Pick 420, 1111, or 6969 YOUCOG.");
  }
  if (!isAddress(input.address.trim(), { strict: false })) {
    return refuse("That isn't a valid Base address. It should start with 0x and be 42 characters.");
  }
  const address = getAddress(input.address.trim());
  // Anti-drain needs a shared database; an in-memory fallback on serverless would reset per instance.
  if (dbSource !== "neon" && process.env.VERCEL) {
    return refuse("The faucet isn't open yet. Check back soon.");
  }
  const c = clients();
  if (!c) return refuse("The faucet isn't open yet. Check back soon.");
  if (address.toLowerCase() === c.account.address.toLowerCase()) {
    return refuse("The faucet can't send to itself.");
  }
  const fid = input.fid;
  if (!fid && !input.ip) return refuse("Couldn't verify your connection. Try again later.");

  // Balance checks before reserving a slot.
  const amountWei = parseUnits(String(input.amount), 18);
  try {
    const [eth, tokens] = await Promise.all([
      c.pub.getBalance({ address: c.account.address }),
      c.pub.readContract({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [c.account.address] }),
    ]);
    if (eth < MIN_GAS_WEI) return refuse("The faucet is out of gas (ETH). Try again after it's topped up.");
    if (tokens < amountWei) return refuse("The faucet is out of YOUCOG for that amount. Try a smaller amount.");
  } catch {
    return refuse("Couldn't reach the Base network. Try again in a minute.");
  }

  const sql = await getSql();
  const day = utcDay();
  // FID claims key the ip slot on the FID so shared Wi-Fi doesn't block Farcaster users.
  const ipHash = fid ? `fid:${fid}` : hashIp(input.ip);

  const prior = await sql<{ address: string; ip_hash: string; fid: string | null }>`
    select address, ip_hash, fid from faucet_claims
    where day = ${day} and status <> 'failed'
      and (address = ${address} or ip_hash = ${ipHash} or (fid is not null and fid = ${fid ?? -1})) limit 1`;
  if (prior.length) {
    return refuse(
      fid && prior[0].fid != null && Number(prior[0].fid) === fid
        ? "Your Farcaster account already claimed today. Come back after midnight UTC."
        : prior[0].address === address
          ? "This address already claimed today. Come back after midnight UTC."
          : "Someone on your connection already claimed today. One claim per person per day.",
    );
  }

  // Atomic global cap: the increment only happens while under the cap.
  const cap = dailyCap();
  const bumped = await sql`
    insert into faucet_days (day, claims) values (${day}, 1)
    on conflict (day) do update set claims = faucet_days.claims + 1
    where faucet_days.claims < ${cap}
    returning claims`;
  if (!bumped.length) return refuse("Today's faucet is all claimed. Come back after midnight UTC.");

  // Reserve the claim first; unique indexes stop concurrent double-claims.
  let id: number;
  try {
    const rows = await sql<{ id: number }>`
      insert into faucet_claims (day, address, ip_hash, amount, fid)
      values (${day}, ${address}, ${ipHash}, ${input.amount}, ${fid ?? null})
      returning id`;
    id = rows[0].id;
  } catch {
    await sql`update faucet_days set claims = claims - 1 where day = ${day}`;
    return refuse("You already claimed today. One claim per address and connection per day.");
  }

  try {
    const txHash = await c.wallet.writeContract({
      address: TOKEN,
      abi: ERC20,
      functionName: "transfer",
      args: [address, amountWei],
      dataSuffix: DATA_SUFFIX,
    });
    await sql`update faucet_claims set status = 'sent', tx_hash = ${txHash} where id = ${id}`;
    return { ok: true, amount: input.amount, txHash, url: `https://basescan.org/tx/${txHash}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "send failed";
    await sql`update faucet_claims set status = 'failed', error = ${msg} where id = ${id}`;
    await sql`update faucet_days set claims = claims - 1 where day = ${day}`;
    console.error("[faucet] send failed:", msg);
    return refuse(
      /insufficient funds/i.test(msg)
        ? "The faucet is out of gas (ETH). Try again after it's topped up."
        : "The transfer didn't go through. Nothing was used up, so you can try again.",
    );
  }
}

export async function faucetStatus() {
  const c = clients();
  if (!c) return { open: false as const };
  try {
    const eth = await c.pub.getBalance({ address: c.account.address });
    return { open: eth >= MIN_GAS_WEI, address: c.account.address, eth: formatEther(eth) };
  } catch {
    return { open: true, address: c.account.address };
  }
}
