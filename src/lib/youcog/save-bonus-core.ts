/**
 * Pure save-bonus rules (no I/O), shared by the server and unit tests.
 */
import { SAVE_BONUS_HOLD_DAYS, SAVE_BONUS_RATE, SAVE_BONUS_WINDOW_DAYS } from "../../constants/save-bonus";

const DAY_MS = 86_400_000;

export type SaveClaim = { id: number; address: string; fid: number | null; amount: number; createdMs: number };

/** Bonus for one claim: 10% of the amount actually sent, rounded down (never overpays). */
export function saveBonusAmount(claimAmount: number): number {
  if (!Number.isFinite(claimAmount) || claimAmount <= 0) return 0;
  return Math.floor(claimAmount * SAVE_BONUS_RATE);
}

export const unlockMs = (createdMs: number) => createdMs + SAVE_BONUS_HOLD_DAYS * DAY_MS;
export const expireMs = (createdMs: number) => unlockMs(createdMs) + SAVE_BONUS_WINDOW_DAYS * DAY_MS;

/** Parse SAVE_BONUS_SINCE. Unset or invalid = the save bonus is closed. */
export function parseSince(raw: string | undefined): number | null {
  const v = raw?.trim();
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/** Split unpaid sent claims into ready (unlocked, not expired), waiting, and expired. */
export function classify(claims: SaveClaim[], nowMs: number, sinceMs: number) {
  const ready: SaveClaim[] = [];
  const waiting: SaveClaim[] = [];
  const expired: SaveClaim[] = [];
  for (const c of claims) {
    if (c.createdMs < sinceMs || saveBonusAmount(c.amount) <= 0) continue;
    if (nowMs < unlockMs(c.createdMs)) waiting.push(c);
    else if (nowMs > expireMs(c.createdMs)) expired.push(c);
    else ready.push(c);
  }
  ready.sort((a, b) => a.createdMs - b.createdMs);
  waiting.sort((a, b) => a.createdMs - b.createdMs);
  return { ready, waiting, expired };
}

export type AddressGroup = { address: string; claims: SaveClaim[]; required: number; bonus: number };

/** Group ready claims by the address they were sent to (the bonus is paid back to that address). */
export function groupByAddress(claims: SaveClaim[]): AddressGroup[] {
  const map = new Map<string, AddressGroup>();
  for (const c of claims) {
    const key = c.address.toLowerCase();
    const g = map.get(key) ?? { address: c.address, claims: [], required: 0, bonus: 0 };
    g.claims.push(c);
    g.required += c.amount;
    g.bonus += saveBonusAmount(c.amount);
    map.set(key, g);
  }
  return [...map.values()];
}

/**
 * The hold check: the address's YOUCOG balance right now must cover every claim
 * being settled for it in this tap (whole tokens, 18 decimals).
 */
export function holdsEnough(balanceWei: bigint, requiredTokens: number): boolean {
  return balanceWei >= BigInt(Math.max(0, Math.floor(requiredTokens))) * 10n ** 18n;
}
