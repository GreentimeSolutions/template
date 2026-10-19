import { useEffect, useRef } from "react";
import { Pause, Play, Sparkles } from "lucide-react";
import { LISTEN_BONUS_AMOUNT, LISTEN_TRACK_TITLE, SOUNDCLOUD_TRACK_URL } from "@/constants/listen";
import {
  beginLocalListen,
  ensureLocalBridge,
  listenActive,
  listenFullPlay,
  listenPlayStarted,
  listenProgress,
  useListen,
} from "@/lib/youcog/listen-client";
import { pauseSoundtrack, toggleSoundtrack, useSoundtrack } from "@/lib/youcog/soundtrack";

type ScWidget = {
  bind: (event: string, cb: (e?: { currentPosition?: number }) => void) => void;
  unbind: (event: string) => void;
};
type ScGlobal = { Widget: ((el: HTMLIFrameElement) => ScWidget) & { Events: Record<string, string> } };

function loadScApi(): Promise<ScGlobal> {
  const w = window as unknown as { SC?: ScGlobal };
  if (w.SC) return Promise.resolve(w.SC);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://w.soundcloud.com/player/api.js";
    s.async = true;
    s.onload = () => (w.SC ? resolve(w.SC) : reject(new Error("SoundCloud widget unavailable")));
    s.onerror = () => reject(new Error("SoundCloud widget unavailable"));
    document.head.appendChild(s);
  });
}

/** SoundCloud embed: real plays count on SoundCloud; PLAY/FINISH drive the server-verified listen. */
function SoundCloudListen() {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let widget: ScWidget | null = null;
    let played = 0;
    let last = 0;
    void loadScApi()
      .then((SC) => {
        widget = SC.Widget(el);
        const E = SC.Widget.Events;
        widget.bind(E.PLAY, () => {
          pauseSoundtrack(); // don't play the background mp3 over the embed
          if (!listenActive()) played = 0; // a fresh session counts from this play
          void listenPlayStarted("soundcloud");
        });
        widget.bind(E.PLAY_PROGRESS, (e) => {
          const t = (e?.currentPosition ?? 0) / 1000;
          const d = t - last;
          if (d > 0 && d <= 1.5) played += d;
          last = t;
          listenProgress(played);
        });
        widget.bind(E.SEEK, (e) => {
          last = (e?.currentPosition ?? 0) / 1000;
        });
        widget.bind(E.FINISH, () => {
          void listenFullPlay(played);
          played = 0;
          last = 0;
        });
      })
      .catch(() => undefined);
    return () => {
      if (!widget) return;
      for (const ev of ["play", "playProgress", "seek", "finish"]) widget.unbind(ev);
    };
  }, []);
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(SOUNDCLOUD_TRACK_URL)}&color=%237c3aed&auto_play=false&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false&visual=false`;
  return (
    <iframe
      ref={ref}
      title={`${LISTEN_TRACK_TITLE} on SoundCloud`}
      src={src}
      allow="autoplay; encrypted-media"
      loading="lazy"
      className="h-[120px] w-full rounded-seal border-0"
    />
  );
}

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Faucet-card block: listen to the whole theme to boost today's claim. */
export function ListenBoost({ ready }: { ready: boolean }) {
  const listen = useListen();
  const music = useSoundtrack();
  useEffect(() => ensureLocalBridge(), []);

  const bonus = LISTEN_BONUS_AMOUNT.toLocaleString();
  const pct = Math.min(100, Math.round((listen.played / Math.max(1, listen.duration)) * 100));
  const usingSc = Boolean(SOUNDCLOUD_TRACK_URL);
  if (!usingSc && music.available === false) return null;

  return (
    <div className="listen-boost" data-tip-target="listen">
      {listen.phase === "unlocked" ? (
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-300" aria-hidden="true" />
            <span className="font-spooky text-xl whitespace-nowrap tracking-wide text-amber-200">Boost unlocked</span>
          </p>
          <p className="text-sm text-mist">Today's claim pays {bonus} YOUCOG, whichever amount is picked.</p>
        </div>
      ) : listen.phase === "used" ? (
        <p className="text-sm text-mist">You used today's listen boost. Come back tomorrow for another.</p>
      ) : (
        <p className="text-sm leading-relaxed text-ink">
          Listen to the full <span className="font-medium text-violet-200">{LISTEN_TRACK_TITLE}</span> to boost today's
          claim to <span className="font-semibold text-amber-200">{bonus} YOUCOG</span>.
        </p>
      )}

      {usingSc && listen.phase !== "unlocked" && listen.phase !== "used" ? (
        <div className="mt-2">
          <SoundCloudListen />
          {!ready && listen.phase === "idle" ? (
            <p className="mt-1 text-xs text-mist">Enter your address first, then press play.</p>
          ) : null}
        </div>
      ) : null}

      {listen.phase === "listening" || listen.phase === "starting" || listen.phase === "verifying" ? (
        <div className="mt-2">
          <div className="listen-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 flex justify-between text-xs text-mist tabular-nums">
            <span>
              {listen.phase === "verifying"
                ? "Checking your listen…"
                : listen.phase === "starting"
                  ? "Starting…"
                  : "Keep listening, no skipping ahead"}
            </span>
            <span>
              {fmt(listen.played)} / {fmt(listen.duration)}
            </span>
          </p>
        </div>
      ) : null}

      {listen.error ? <p className="mt-2 text-xs text-danger">{listen.error}</p> : null}

      {!usingSc && listen.phase !== "unlocked" && listen.phase !== "used" ? (
        <div className="mt-2 flex gap-2">
          {listen.phase === "listening" ? (
            <button
              type="button"
              className="press inline-flex h-10 items-center gap-2 rounded-seal border border-line-strong px-3 text-sm font-medium text-ink"
              onClick={toggleSoundtrack}
            >
              {music.playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {music.playing ? "Pause" : "Resume"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready || listen.phase === "starting" || listen.phase === "verifying"}
              className="press inline-flex h-10 items-center gap-2 rounded-seal border border-violet-400/60 bg-violet-600/25 px-3 text-sm font-medium text-ink disabled:opacity-50"
              onClick={() => beginLocalListen()}
            >
              <Play className="size-4" aria-hidden="true" />
              {ready ? "Play the theme for the boost" : "Enter your address to start"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
