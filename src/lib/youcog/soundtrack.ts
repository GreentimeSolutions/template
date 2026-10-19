import { useEffect, useSyncExternalStore } from "react";
import { SOUNDTRACK_SRC, SOUNDTRACK_VOLUME } from "@/constants/media";

/**
 * One shared background-music player for the whole app. Off by default,
 * starts only on a user tap, loops, pauses while the tab is hidden and
 * remembers on/off in localStorage. Hides itself when the file is missing.
 */
const PREF_KEY = "youcog:music";
type State = { available: boolean | null; playing: boolean };
let state: State = { available: null, playing: false };
let audio: HTMLAudioElement | null = null;
let wantOn = false;
let started = false;
const listeners = new Set<() => void>();

/**
 * Played-time tracking for the listen bonus. Only real forward playback counts
 * (seeking ahead is ignored); a loop wrap after the last second counts as the
 * first full play.
 */
export type PlaybackEvents = {
  onPlay?: () => void;
  onProgress?: (playedSeconds: number, durationSeconds: number) => void;
  onFullPlay?: (playedSeconds: number) => void;
};
const playbackSubs = new Set<PlaybackEvents>();
let played = 0;
let lastTime = 0;
let fullPlayFired = false;

export function subscribePlayback(events: PlaybackEvents) {
  playbackSubs.add(events);
  return () => playbackSubs.delete(events);
}

/** Reset played-time tracking from the current position (a new bonus listen started mid-song). */
export function resetPlayedTracking() {
  played = 0;
  fullPlayFired = false;
  lastTime = audio?.currentTime ?? 0;
}

/** Restart the song from the top and reset played-time tracking (used to begin a bonus listen). */
export function restartSoundtrack() {
  if (state.available === false) return false;
  const a = getAudio();
  played = 0;
  lastTime = 0;
  fullPlayFired = false;
  try {
    a.currentTime = 0;
  } catch {
    /* not loaded yet */
  }
  wantOn = true;
  savePref(true);
  void a.play().catch(() => set({ playing: false }));
  return true;
}

function onTimeUpdate() {
  if (!audio) return;
  const t = audio.currentTime;
  const d = Number.isFinite(audio.duration) ? audio.duration : 0;
  const delta = t - lastTime;
  if (delta > 0 && delta <= 1.5) played += delta;
  const wrapped = delta < -1 && d > 0 && lastTime >= d - 1.5;
  if (wrapped) played += Math.max(0, d - lastTime);
  lastTime = t;
  for (const s of playbackSubs) s.onProgress?.(played, d);
  if (!fullPlayFired && d > 0 && (wrapped || played >= d - 0.5)) {
    fullPlayFired = true;
    for (const s of playbackSubs) s.onFullPlay?.(played);
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function getAudio() {
  if (audio) return audio;
  audio = new Audio(SOUNDTRACK_SRC);
  audio.loop = true;
  audio.preload = "none";
  audio.volume = SOUNDTRACK_VOLUME;
  audio.addEventListener("error", () => set({ playing: false, available: false }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("play", () => {
    set({ playing: true });
    if (audio) lastTime = audio.currentTime;
    for (const s of playbackSubs) s.onPlay?.();
  });
  audio.addEventListener("timeupdate", onTimeUpdate);
  audio.addEventListener("seeking", () => {
    if (audio) lastTime = audio.currentTime;
  });
  return audio;
}

function play() {
  void getAudio()
    .play()
    .catch(() => set({ playing: false }));
}

function savePref(on: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked */
  }
}

/** Stop the background music (e.g. another player, like the SoundCloud embed, started). */
export function pauseSoundtrack() {
  wantOn = false;
  audio?.pause();
}

export function toggleSoundtrack() {
  if (!state.available) return;
  const next = !state.playing;
  wantOn = next;
  savePref(next);
  if (next) play();
  else audio?.pause();
}

function init() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetch(SOUNDTRACK_SRC, { method: "HEAD" })
    .then((r) => {
      const type = r.headers.get("content-type") ?? "";
      const ok = r.ok && type.startsWith("audio/");
      set({ available: ok });
      if (!ok) return;
      let pref: string | null = null;
      try {
        pref = window.localStorage.getItem(PREF_KEY);
      } catch {
        /* storage blocked */
      }
      if (pref !== "on") return;
      wantOn = true;
      // Resume only on the visitor's first tap anywhere (no autoplay).
      window.addEventListener(
        "pointerdown",
        () => {
          if (wantOn && !document.hidden && !state.playing) play();
        },
        { once: true, capture: true },
      );
    })
    .catch(() => set({ available: false }));
  document.addEventListener("visibilitychange", () => {
    if (!audio) return;
    if (document.hidden) audio.pause();
    else if (wantOn) void audio.play().catch(() => undefined);
  });
}

export function useSoundtrack(): State {
  useEffect(() => init(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
