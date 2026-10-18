/**
 * Media row config (top of the app). Edit these to add content later.
 */

/** Youcognito Run minigame on Remix. */
export const GAME_URL = "https://remix.gg/g/youcognito-run";
export const GAME_THUMB = "/youcognito-run.webp";

/**
 * Background soundtrack (public/audio/youcog-theme.mp3, our own theremin track). To swap it, replace that file (or change
 * this path). If the file is missing or fails to load, the tile hides itself.
 */
export const SOUNDTRACK_SRC = "/audio/youcog-theme.mp3";
export const SOUNDTRACK_THUMB = "/spooky-soundtrack.webp";
export const SOUNDTRACK_VOLUME = 0.35;

/**
 * YouTube Short tile. Leave url empty to hide the tile. thumb can be a file in
 * public/ (e.g. "/youtube-short.webp") or an https image URL.
 */
export const YOUTUBE_SHORT = {
  url: "https://youtube.com/shorts/YxUk8b6K9-E",
  /** Square thumb (256px). */
  thumb: "/youtube-short.webp",
  /** Tall thumb used by the home grid, where the Short spans two rows. */
  thumbTall: "/youtube-short-tall.webp",
  title: "Watch the Short",
};

/** Small square thumbs for the home grid. */
export const DEEP_MISSION_THUMB = "/deep-mission-thumb.webp";
export const FAUCET_THUMB = "/faucet-thumb.webp";

/**
 * Project-owned wallets (agent/faucet, donations). Their trades never appear as
 * buy slides, so the bubble only shows buys from outside users. Lowercase.
 */
export const PROJECT_WALLETS = [
  "0x3067ab541253746ab353b842fdc0970ffbde13c7", // Youcog agent + faucet wallet
  "0xa959d8eeded6fb440ca584d1e87e581168bbf628", // donations
];
