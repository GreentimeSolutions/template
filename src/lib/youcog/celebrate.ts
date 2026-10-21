/** Cosmetic reward celebration. Components listen for this window event; nothing here touches claim logic. */
export const CELEBRATE_EVENT = "youcog:celebrate";

/** What the ghost overlay shows. Pass the real amount from the API response, never a guess. */
export type CelebrateDetail = { amount?: number; title?: string; subtitle?: string };

/** Fire only after a confirmed success. With a detail it also shows the ghost overlay. */
export function celebrate(detail?: CelebrateDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT, { detail }));
}
