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
  url: "",
  thumb: "",
  title: "Watch the Short",
};
