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
  | { ok: true; amount: number; baseAmount: number; streak: number; multiplier: number; txHash: string; url: string }
  | { ok: false; reason: string };

const refuse = (reason: string): ClaimResult => ({ ok: false, reason });

function dailyCap(): number {
  const n = Number(process.env.FAUCET_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
}

function dailyTokenBudget(): number {
  const n = Number(process.env.FAUCET_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 250000;
}

/** Streak bonus: day 3+ = 1.25x, day 7+ = 1.5x (capped at 1.5x). */
export function streakMultiplier(streak: number): number {
  return streak >= 7 ? 1.5 : streak >= 3 ? 1.25 : 1;
}

function dayOffset(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive sent-claim days ending at `endDay` (inclusive), from a list of distinct days. */
function runEndingAt(days: Set<string>, endDay: string): number {
  let n = 0;
  let d = endDay;
  while (days.has(d)) {
    n++;
    d = dayOffset(d, -1);
  }
  return n;
}

type Sql = Awaited<ReturnType<typeof getSql>>;

async function claimDays(sql: Sql, who: { fid?: number; address?: string }): Promise<Set<string>> {
  const rows = who.fid
    ? await sql<{ day: string }>`select distinct to_char(day, 'YYYY-MM-DD') as day from faucet_claims where status = 'sent' and fid = ${who.fid} order by 1 desc limit 400`
    : await sql<{ day: string }>`select distinct to_char(day, 'YYYY-MM-DD') as day from faucet_claims where status = 'sent' and address = ${who.address ?? ""} order by 1 desc limit 400`;
  return new Set(rows.map((r) => String(r.day)));
}

/** Current streak (alive if the last claim was today or yesterday) and what the next claim would be. */
export async function streakInfo(who: { fid?: number; address?: string }) {
  if (!who.fid && !who.address) return { streak: 0, claimedToday: false, nextStreak: 1, nextMultiplier: 1 };
  const sql = await getSql();
  const address = who.address && isAddress(who.address, { strict: false }) ? getAddress(who.address) : undefined;
  const days = await claimDays(sql, { fid: who.fid, address });
  const today = utcDay();
  const claimedToday = days.has(today);
  const streak = claimedToday ? runEndingAt(days, today) : runEndingAt(days, dayOffset(today, -1));
  const nextStreak = claimedToday ? streak : streak + 1;
  return { streak, claimedToday, nextStreak, nextMultiplier: streakMultiplier(nextStreak) };
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

  // Streak: consecutive UTC days with a sent claim (per FID in the Mini App, per address on web).
  const sql = await getSql();
  const day = utcDay();
  const days = await claimDays(sql, fid ? { fid } : { address });
  const streak = runEndingAt(days, dayOffset(day, -1)) + 1;
  const multiplier = streakMultiplier(streak);
  const sendAmount = Math.round(input.amount * multiplier);

  // Balance checks before reserving a slot.
  const amountWei = parseUnits(String(sendAmount), 18);
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
  // Token budget (bonus included) is reserved atomically too.
  const budget = dailyTokenBudget();
  const reserved = await sql`
    update faucet_days set tokens = tokens + ${sendAmount}
    where day = ${day} and tokens + ${sendAmount} <= ${budget}
    returning tokens`;
  if (!reserved.length) {
    await sql`update faucet_days set claims = claims - 1 where day = ${day}`;
    return refuse("Today's faucet budget is nearly used up. Try a smaller amount or come back after midnight UTC.");
  }
  const release = () => sql`update faucet_days set claims = claims - 1, tokens = tokens - ${sendAmount} where day = ${day}`;

  // Reserve the claim first; unique indexes stop concurrent double-claims.
  let id: number;
  try {
    const rows = await sql<{ id: number }>`
      insert into faucet_claims (day, address, ip_hash, amount, fid, base_amount, streak)
      values (${day}, ${address}, ${ipHash}, ${sendAmount}, ${fid ?? null}, ${input.amount}, ${streak})
      returning id`;
    id = rows[0].id;
  } catch {
    await release();
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
    return { ok: true, amount: sendAmount, baseAmount: input.amount, streak, multiplier, txHash, url: `https://basescan.org/tx/${txHash}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "send failed";
    await sql`update faucet_claims set status = 'failed', error = ${msg} where id = ${id}`;
    await release();
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

const DONATE = "0xa959d8eeded6fb440ca584d1e87e581168bbf628";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Record a tip sent via the Support widget after verifying it on Base. */
export async function recordTip(hash: string, fid?: number) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return { ok: false as const, reason: "Bad tx hash." };
  const transport = http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org");
  const pub = createPublicClient({ chain: base, transport });
  const h = hash as `0x${string}`;
  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash: h, timeout: 20_000 });
  } catch {
    return { ok: false as const, reason: "Tip not confirmed yet." };
  }
  if (receipt.status !== "success") return { ok: false as const, reason: "Tip failed on-chain." };
  const tx = await pub.getTransaction({ hash: h });
  let token: "ETH" | "USDC" | null = null;
  let amount = "0";
  if (tx.to?.toLowerCase() === DONATE && tx.value > 0n) {
    token = "ETH";
    amount = formatEther(tx.value);
  } else {
    const log = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === USDC &&
        l.topics[0] === TRANSFER_TOPIC &&
        l.topics[2]?.toLowerCase().endsWith(DONATE.slice(2)),
    );
    if (log) {
      token = "USDC";
      amount = (Number(BigInt(log.data)) / 1e6).toString();
    }
  }
  if (!token) return { ok: false as const, reason: "Not a tip to Youcog." };
  const sql = await getSql();
  await sql`insert into tips (tx_hash, from_address, token, amount, fid)
    values (${h.toLowerCase()}, ${getAddress(tx.from)}, ${token}, ${amount}, ${fid ?? null})
    on conflict (tx_hash) do nothing`;
  return { ok: true as const, token, amount };
}

const profileCache = new Map<number, { at: number; username?: string; pfp?: string }>();
async function fcProfile(fid: number) {
  const hit = profileCache.get(fid);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit;
  let v: { at: number; username?: string; pfp?: string } = { at: Date.now() };
  try {
    const r = await fetch(`https://api.farcaster.xyz/v2/user?fid=${fid}`, { signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      const u = (await r.json())?.result?.user;
      v = { at: Date.now(), username: u?.username, pfp: u?.pfp?.url };
    }
  } catch {
    /* fall back to FID */
  }
  profileCache.set(fid, v);
  return v;
}

function bestRuns(days: string[]) {
  const set = new Set(days);
  let longest = 0;
  for (const d of days) if (!set.has(dayOffset(d, -1))) longest = Math.max(longest, runEndingAt(set, lastOf(set, d)));
  const today = utcDay();
  const current = set.has(today) ? runEndingAt(set, today) : runEndingAt(set, dayOffset(today, -1));
  return { longest, current };
}
function lastOf(set: Set<string>, start: string) {
  let d = start;
  while (set.has(dayOffset(d, 1))) d = dayOffset(d, 1);
  return d;
}

export async function leaderboard() {
  const sql = await getSql();
  // Identity: FID when present, else address.
  const rows = await sql<{ who: string; fid: string | null; address: string; total: string; claims: string; days: string[] }>`
    select coalesce('fid:' || fid::text, address) as who, max(fid)::text as fid, max(address) as address,
      sum(amount)::text as total, count(*)::text as claims,
      array_agg(distinct to_char(day, 'YYYY-MM-DD')) as days
    from faucet_claims where status = 'sent'
    group by 1 order by sum(amount) desc limit 25`;
  const holderRows = await sql<{ address: string; fid: string | null }>`
    select address, fid::text as fid from holders where is_holder and verified_at > now() - interval '7 days'`.catch(() => []);
  const holderAddrs = new Set(holderRows.map((h) => h.address.toLowerCase()));
  const holderFids = new Set(holderRows.filter((h) => h.fid).map((h) => Number(h.fid)));
  const claimers = await Promise.all(
    rows.map(async (r) => {
      const fid = r.fid ? Number(r.fid) : null;
      const p = fid ? await fcProfile(fid) : null;
      const { longest, current } = bestRuns((r.days ?? []).map(String));
      return {
        fid,
        username: p?.username ?? null,
        pfp: p?.pfp ?? null,
        address: r.address,
        total: Number(r.total),
        claims: Number(r.claims),
        longestStreak: longest,
        currentStreak: current,
        holder: (fid != null && holderFids.has(fid)) || holderAddrs.has(String(r.address).toLowerCase()),
      };
    }),
  );
  const tipRows = await sql<{ who: string; fid: string | null; address: string; eth: string; usdc: string; n: string }>`
    select coalesce('fid:' || fid::text, from_address) as who, max(fid)::text as fid, max(from_address) as address,
      coalesce(sum(amount) filter (where token = 'ETH'), 0)::text as eth,
      coalesce(sum(amount) filter (where token = 'USDC'), 0)::text as usdc, count(*)::text as n
    from tips group by 1 order by count(*) desc limit 10`;
  const tippers = await Promise.all(
    tipRows.map(async (r) => {
      const fid = r.fid ? Number(r.fid) : null;
      const p = fid ? await fcProfile(fid) : null;
      return { fid, username: p?.username ?? null, pfp: p?.pfp ?? null, address: r.address, eth: Number(r.eth), usdc: Number(r.usdc), tips: Number(r.n) };
    }),
  );
  return { claimers, tippers };
}

/** Builder Code attribution went live with commit 2ea3e1a (2026-10-13 02:27 UTC). */
const BUILDER_CODE_SINCE = "2026-10-13T02:27:30Z";

export async function stats() {
  const sql = await getSql();
  const [t] = await sql<Record<string, string>>`
    select count(*)::text as claims,
      count(distinct address)::text as wallets,
      count(distinct fid)::text as fids,
      count(distinct coalesce('fid:' || fid::text, address))::text as claimers,
      coalesce(sum(amount), 0)::text as distributed,
      count(*) filter (where created_at > now() - interval '24 hours')::text as last24h,
      count(*) filter (where created_at > now() - interval '7 days')::text as last7d,
      count(*) filter (where created_at >= ${BUILDER_CODE_SINCE}::timestamptz)::text as attributed
    from faucet_claims where status = 'sent'`;
  const daily = await sql<{ day: string; claims: string; tokens: string }>`
    select to_char(day, 'YYYY-MM-DD') as day, count(*)::text as claims, sum(amount)::text as tokens
    from faucet_claims where status = 'sent' and day > current_date - 30
    group by day order by day`;
  const who = await sql<{ days: string[] }>`
    select array_agg(distinct to_char(day, 'YYYY-MM-DD')) as days
    from faucet_claims where status = 'sent' group by coalesce('fid:' || fid::text, address)`;
  let active = 0;
  let longest = 0;
  for (const w of who) {
    const r = bestRuns((w.days ?? []).map(String));
    if (r.current > 0) active++;
    longest = Math.max(longest, r.longest);
  }
  const [tp] = await sql<Record<string, string>>`
    select count(*)::text as n,
      coalesce(sum(amount) filter (where token = 'ETH'), 0)::text as eth,
      coalesce(sum(amount) filter (where token = 'USDC'), 0)::text as usdc,
      count(*) filter (where created_at >= ${BUILDER_CODE_SINCE}::timestamptz)::text as attributed
    from tips`;

  const [hp] = await sql<{ n: string }>`
    select count(distinct coalesce('fid:' || fid::text, address))::text as n from holders
    where is_holder and verified_at > now() - interval '7 days'`.catch(() => [{ n: "0" }]);
  const transport = http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org");
  const pub = createPublicClient({ chain: base, transport });
  const c = clients();
  const wallet = c?.account.address ?? "0x3067ab541253746AB353b842Fdc0970ffBDe13c7";
  let balances: { eth: string; youcog: string } | null = null;
  try {
    const [eth, tok] = await Promise.all([
      pub.getBalance({ address: wallet as `0x${string}` }),
      pub.readContract({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [wallet as `0x${string}`] }),
    ]);
    balances = { eth: formatEther(eth), youcog: formatEther(tok) };
  } catch {
    /* RPC down */
  }
  // Fill missing days with zero for the chart.
  const byDay = new Map(daily.map((d) => [String(d.day), d]));
  const chart = [];
  for (let i = 29; i >= 0; i--) {
    const d = dayOffset(utcDay(), -i);
    const r = byDay.get(d);
    chart.push({ day: d, claims: r ? Number(r.claims) : 0, tokens: r ? Number(r.tokens) : 0 });
  }
  return {
    updatedAt: new Date().toISOString(),
    claims: {
      total: Number(t.claims),
      uniqueClaimers: Number(t.claimers),
      uniqueWallets: Number(t.wallets),
      uniqueFids: Number(t.fids),
      distributed: Number(t.distributed),
      last24h: Number(t.last24h),
      last7d: Number(t.last7d),
    },
    streaks: { active, longest },
    tips: { count: Number(tp.n), eth: Number(tp.eth), usdc: Number(tp.usdc) },
    perks: { holders: Number(hp?.n ?? 0) },
    builderCode: { code: "bc_q72p8qc9", since: BUILDER_CODE_SINCE, attributedTxs: Number(t.attributed) + Number(tp.attributed) },
    faucet: { address: getAddress(wallet), ...balances },
    token: TOKEN,
    daily: chart,
  };
}
