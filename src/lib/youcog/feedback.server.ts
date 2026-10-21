import { getAddress, isAddress, parseUnits } from "viem";
import {
  FEEDBACK_DAILY_CAP_DEFAULT,
  FEEDBACK_MIN_FAUCET_BALANCE,
  FEEDBACK_REQUIRE_PRIOR_CLAIM,
  FEEDBACK_REWARD_YOUCOG,
} from "../../constants/feedback";
import { validateFeedback } from "./feedback-core";

/**
 * Feedback survey reward. Relative imports only (no "@/"), so tests can run it
 * against PGLite with a fake payer. The real payer is the faucet wallet's
 * sendYoucog (see routes/api/feedback.ts).
 */
export type FeedbackSql = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

export type FeedbackPayer = {
  address: string;
  minGasWei: bigint;
  balances(): Promise<{ eth: bigint; tokens: bigint }>;
  send(to: `0x${string}`, amountWei: bigint): Promise<`0x${string}`>;
};

export type FeedbackResult =
  | { ok: true; amount: number; txHash: string; url: string }
  | { ok: false; reason: string; field?: string; done?: boolean };

const refuse = (reason: string, extra: { field?: string; done?: boolean } = {}): FeedbackResult => ({ ok: false, reason, ...extra });

export function feedbackDailyCap(): number {
  const n = Number(process.env.FEEDBACK_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : FEEDBACK_DAILY_CAP_DEFAULT;
}

/** Has this person already been rewarded (or is a reward in flight)? */
export async function feedbackStatus(sql: FeedbackSql, who: { fid?: number; address?: string }) {
  const address = who.address && isAddress(who.address, { strict: false }) ? getAddress(who.address) : null;
  if (!who.fid && !address) return { done: false, reward: FEEDBACK_REWARD_YOUCOG };
  const rows = await sql<{ status: string }>`
    select status from feedback_responses
    where status <> 'failed' and ((fid is not null and fid = ${who.fid ?? -1}) or lower(address) = lower(${address ?? ""}))
    limit 1`;
  return { done: rows.length > 0, reward: FEEDBACK_REWARD_YOUCOG };
}

export async function submitFeedback(
  sql: FeedbackSql,
  payer: FeedbackPayer | null,
  input: { answers: unknown; address: string; fid?: number; ipHash?: string },
  nowMs = Date.now(),
): Promise<FeedbackResult> {
  const check = validateFeedback(input.answers);
  if (!check.ok) return refuse(check.reason, { field: check.field });

  const rawAddress = (input.address ?? "").trim();
  if (!isAddress(rawAddress, { strict: false })) {
    return refuse("Enter your Base address so we know where to send your YOUCOG.", { field: "address" });
  }
  const address = getAddress(rawAddress);
  const fid = input.fid && Number.isSafeInteger(input.fid) && input.fid > 0 ? input.fid : undefined;
  const ipHash = fid ? null : input.ipHash || null;
  if (!fid && !ipHash) return refuse("Couldn't verify your connection. Try again later.");

  if (!payer) return refuse("Feedback gifts aren't open yet. Check back soon.");
  if (address.toLowerCase() === payer.address.toLowerCase()) return refuse("The faucet can't send to itself.");

  const prior = await sql<{ fid: unknown; address: string; ip_hash: string | null }>`
    select fid, address, ip_hash from feedback_responses
    where status <> 'failed'
      and ((fid is not null and fid = ${fid ?? -1}) or lower(address) = lower(${address}) or (fid is null and ip_hash = ${ipHash ?? ""}))
    limit 1`;
  if (prior.length) {
    const p = prior[0];
    return refuse(
      fid && p.fid != null && Number(p.fid) === fid
        ? "Your Farcaster account already got the feedback thank-you gift. Thanks again!"
        : p.address.toLowerCase() === address.toLowerCase()
          ? "This wallet already got the feedback thank-you gift. Thanks again!"
          : "Someone on your connection already got the feedback thank-you gift. It's one per person.",
      { done: true },
    );
  }

  if (FEEDBACK_REQUIRE_PRIOR_CLAIM) {
    const claimed = fid
      ? await sql`select 1 from faucet_claims where status = 'sent' and fid = ${fid} limit 1`
      : await sql`select 1 from faucet_claims where status = 'sent' and address = ${address} limit 1`;
    if (!claimed.length) {
      return refuse(
        fid
          ? "Claim from the daily faucet once first, then come back to share feedback."
          : "Claim from the daily faucet with this address once first, then come back to share feedback.",
      );
    }
  }

  const amount = FEEDBACK_REWARD_YOUCOG;
  const amountWei = parseUnits(String(amount), 18);
  const minLeftWei = parseUnits(String(FEEDBACK_MIN_FAUCET_BALANCE), 18);
  try {
    const { eth, tokens } = await payer.balances();
    if (eth < payer.minGasWei) return refuse("The faucet is out of gas (ETH). Try again after it's topped up.");
    if (tokens - amountWei < minLeftWei) return refuse("The feedback gift pool is low right now. Try again after it's topped up.");
  } catch {
    return refuse("Couldn't reach the Base network. Try again in a minute.");
  }

  const day = new Date(nowMs).toISOString().slice(0, 10);
  const bumped = await sql`
    insert into feedback_days (day, rewards) values (${day}, 1)
    on conflict (day) do update set rewards = feedback_days.rewards + 1
    where feedback_days.rewards < ${feedbackDailyCap()}
    returning rewards`;
  if (!bumped.length) return refuse("Today's feedback thank-you gifts are all used. Come back after midnight UTC.");
  const release = () => sql`update feedback_days set rewards = rewards - 1 where day = ${day}`;

  // Reserve first: the unique indexes stop concurrent double rewards per FID, wallet and connection.
  let id: number;
  try {
    const rows = await sql<{ id: number }>`
      insert into feedback_responses (fid, address, ip_hash, answers, amount)
      values (${fid ?? null}, ${address}, ${ipHash}, ${JSON.stringify(check.answers)}::jsonb, ${amount})
      returning id`;
    id = Number(rows[0].id);
  } catch {
    await release();
    return refuse("You already sent feedback. It's one thank-you gift per person.", { done: true });
  }

  try {
    const txHash = await payer.send(address, amountWei);
    await sql`update feedback_responses set status = 'sent', tx_hash = ${txHash} where id = ${id}`;
    return { ok: true, amount, txHash, url: `https://basescan.org/tx/${txHash}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "send failed";
    await sql`update feedback_responses set status = 'failed', error = ${msg} where id = ${id}`;
    await release();
    console.error("[feedback] send failed:", msg);
    return refuse(
      /insufficient funds/i.test(msg)
        ? "The faucet is out of gas (ETH). Your answers are saved; try again after it's topped up."
        : "The transfer didn't go through. Your answers are saved, so you can try again.",
    );
  }
}
