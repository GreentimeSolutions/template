/**
 * "Listen for the boost": a full, server-verified listen of the theme upgrades
 * that day's faucet claim to LISTEN_BONUS_AMOUNT. Swap songs by changing the
 * file (or SoundCloud URL) AND LISTEN_SONG_SECONDS together: the server only
 * trusts this duration, never the client.
 */

/** Claim amount after a verified full listen (flat; the streak multiplier is not applied on top). */
export const LISTEN_BONUS_AMOUNT = 100_000;

/** Song length in seconds. Current file public/audio/youcog-theme.mp3 is 33.28s. Remix ~200s, full theme ~252s. */
export const LISTEN_SONG_SECONDS = 33;

/** Allowed early finish (network/latency slack) in seconds. */
export const LISTEN_TOLERANCE_SECONDS = 3;

/** A session must be finished within this many seconds after the song length, or it expires. */
export const LISTEN_SESSION_GRACE_SECONDS = 15 * 60;

/** Most listen sessions one identity may start per UTC day (anti-spam). */
export const LISTEN_MAX_STARTS_PER_DAY = 30;

/** If the faucet wallet holds less than this many YOUCOG, bonus claims fall back to the base amount. */
export const LISTEN_MIN_FAUCET_BALANCE = 2_000_000;

export const LISTEN_TRACK_TITLE = "Youcognito Theme";

/**
 * Published SoundCloud track URL (e.g. "https://soundcloud.com/youcognito/youcognito-theme").
 * Empty = use the local mp3 player (SOUNDTRACK_SRC) instead. When set, the bonus
 * listen plays through the SoundCloud embed so it counts as real plays there.
 */
export const SOUNDCLOUD_TRACK_URL = "";
