/**
 * Play section: small ghostly toys that live on their OWN sites (separate Vercel projects, separate origins).
 *
 * Silo rule: Youcognito only links out. No app code is bundled, iframed or served from this origin, so the toys can
 * never reach Youcognito's wallets, faucet, database, API routes, cookies or local storage.
 *
 * Theremancer's URL comes from build-time env VITE_PLAY_THEREMANCER_URL. Unset or non-https means the entry shows
 * "Opening soon" with no link, so production stays unchanged until the standalone site is public.
 */
function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type PlayEntry = {
  id: "theremancer";
  title: string;
  blurb: string;
  note: string;
  thumb: string;
  url: string | null;
};

export const PLAY_ENTRIES: PlayEntry[] = [
  {
    id: "theremancer",
    title: "Theremancer",
    blurb: "A haunted theremin. Wave a hand left and right to bend the pitch, then catch the ghost notes in the seance song game.",
    note: "Camera is optional and stays on your device. Pointer mode works without it.",
    thumb: "/play/theremancer.svg",
    url: httpsUrl(import.meta.env.VITE_PLAY_THEREMANCER_URL as string | undefined),
  },
];
