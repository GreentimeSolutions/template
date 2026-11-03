/**
 * Cosmetic "Forge" claim cinematic event bus. Purely visual: the faucet fires
 * start when the real claim request goes out and resolve when the real API
 * response lands. Nothing here touches claim logic or the on-chain transfer.
 * Behind VITE_FORGE_CLAIM === "1" (default off).
 */
export const FORGE_CLAIM_START = "youcog:forge-claim-start";
export const FORGE_CLAIM_RESOLVE = "youcog:forge-claim-resolve";

export const forgeClaimEnabled = () => import.meta.env.VITE_FORGE_CLAIM === "1";

export type ForgeClaimStart = { address: string; amount: number; streakDay?: number };
export type ForgeClaimResolve = { ok: true; amount: number; streak?: number; note?: string } | { ok: false; reason?: string };

export function forgeClaimStart(d: ForgeClaimStart) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FORGE_CLAIM_START, { detail: d }));
}
export function forgeClaimResolve(d: ForgeClaimResolve) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FORGE_CLAIM_RESOLVE, { detail: d }));
}
