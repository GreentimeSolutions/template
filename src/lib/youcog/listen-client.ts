import { useSyncExternalStore } from "react";
import { LISTEN_SONG_SECONDS, LISTEN_TOLERANCE_SECONDS, SOUNDCLOUD_TRACK_URL } from "@/constants/listen";
import { resetPlayedTracking, restartSoundtrack, subscribePlayback } from "@/lib/youcog/soundtrack";

/**
 * Client side of "listen for the boost". Any player (local mp3, SoundCloud
 * widget, later Audius...) reports three things: play started, progress, and
 * a full play. The server records the start time and only accepts the finish
 * after the song's real length has passed, so the client can't fake it.
 */
export type ListenPhase = "idle" | "starting" | "listening" | "verifying" | "unlocked" | "used" | "error";
type State = { phase: ListenPhase; played: number; duration: number; error: string | null };

let state: State = { phase: "idle", played: 0, duration: LISTEN_SONG_SECONDS, error: null };
const subs = new Set<() => void>();
let identity: { address?: string; fc: boolean } | null = null;
let sessionId: string | null = null;
let source = SOUNDCLOUD_TRACK_URL ? "soundcloud" : "local";

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const s of subs) s();
}

async function post(path: string, body: Record<string, unknown>) {
  const payload = JSON.stringify({ ...body, address: identity?.address });
  if (identity?.fc) {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    const r = await sdk.quickAuth.fetch(`${window.location.origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    return r.json();
  }
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  return r.json();
}

/** The faucet card tells us who is claiming (Farcaster account, or the typed Base address). */
export function setListenIdentity(next: { address?: string; fc: boolean } | null) {
  const changed = JSON.stringify(next) !== JSON.stringify(identity);
  identity = next;
  if (!changed) return;
  sessionId = null;
  if (state.phase !== "listening" && state.phase !== "starting") set({ phase: "idle", played: 0, error: null });
  if (next && (next.fc || next.address)) void refreshListenStatus();
}

export async function refreshListenStatus() {
  if (!identity) return;
  try {
    const r = (await post("/api/listen/status", {})) as { unlocked?: boolean; used?: boolean };
    if (r.unlocked) set({ phase: "unlocked", error: null });
    else if (r.used && state.phase === "idle") set({ phase: "used" });
  } catch {
    /* status is a nicety */
  }
}

/** A player started playing: open a server session if one isn't running. */
export async function listenPlayStarted(from: string) {
  if (!identity || (!identity.fc && !identity.address)) return;
  if (state.phase === "starting" || state.phase === "listening" || state.phase === "verifying") return;
  if (state.phase === "unlocked" || state.phase === "used") return;
  source = from;
  if (from === "local") resetPlayedTracking();
  set({ phase: "starting", played: 0, error: null });
  try {
    const r = (await post("/api/listen/start", { source: from })) as {
      ok: boolean;
      sessionId?: string;
      songSeconds?: number;
      reason?: string;
    };
    if (!r.ok || !r.sessionId) {
      set({ phase: "error", error: r.reason ?? "Couldn't start the listen." });
      return;
    }
    sessionId = r.sessionId;
    set({ phase: "listening", duration: r.songSeconds ?? LISTEN_SONG_SECONDS });
  } catch {
    set({ phase: "error", error: "Couldn't start the listen. Check your connection." });
  }
}

export function listenProgress(playedSeconds: number) {
  if (state.phase !== "listening") return;
  set({ played: Math.min(playedSeconds, state.duration) });
}

/** A player reported a full play. The server decides if enough real time passed. */
export async function listenFullPlay(playedSeconds: number) {
  if (state.phase !== "listening" || !sessionId) return;
  if (playedSeconds < state.duration - LISTEN_TOLERANCE_SECONDS) return;
  set({ phase: "verifying", played: state.duration });
  try {
    const r = (await post("/api/listen/finish", { sessionId, playedSeconds })) as { ok: boolean; reason?: string };
    if (r.ok) set({ phase: "unlocked", error: null });
    else set({ phase: "error", error: r.reason ?? "That listen didn't count. Try again." });
  } catch {
    set({ phase: "error", error: "Couldn't verify the listen. Try again." });
  }
  sessionId = null;
}

/** Called after a successful bonus claim. */
export function markListenUsed() {
  set({ phase: "used", played: 0 });
}

/** Local mp3: restart from the top and listen (the play event opens the session). */
export function beginLocalListen() {
  if (state.phase === "error") set({ phase: "idle", error: null });
  return restartSoundtrack();
}

// Bridge the shared local player into the listen flow (only when SoundCloud isn't configured).
let bridged = false;
export function ensureLocalBridge() {
  if (bridged || typeof window === "undefined" || SOUNDCLOUD_TRACK_URL) return;
  bridged = true;
  subscribePlayback({
    onPlay: () => void listenPlayStarted("local"),
    onProgress: (p) => listenProgress(p),
    onFullPlay: (p) => void listenFullPlay(p),
  });
}

export function useListen(): State & { source: string } {
  const snap = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => state,
  );
  return { ...snap, source };
}
