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
  audio.addEventListener("play", () => set({ playing: true }));
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
