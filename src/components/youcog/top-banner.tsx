import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import {
  GAME_THUMB,
  GAME_URL,
  SOUNDTRACK_SRC,
  SOUNDTRACK_THUMB,
  SOUNDTRACK_VOLUME,
  YOUTUBE_SHORT,
} from "@/constants/media";

const MUSIC_PREF_KEY = "youcog:music";

/** Small animated spy ghost (same shapes as public/favicon.svg). */
function BannerGhost() {
  return (
    <span className="banner-ghost" aria-hidden="true">
      <svg viewBox="0 0 32 32" className="size-full">
        <path
          fill="#D7DDE6"
          d="M6.2 29.5V21.6c0-2.4 2.2-3.6 4.6-3.1l3.3 3.3c.6.7 1.2 1 1.9 1s1.3-.3 1.9-1l3.3-3.3c2.4-.5 4.6.7 4.6 3.1v7.9H6.2z"
        />
        <path
          fill="#ECEAE6"
          d="M10.5 13.4h11c1.4 0 2.3 1 2.3 2.5v2.8c0 2.1-1.7 3.4-3.7 3.4h-8.2c-2 0-3.7-1.3-3.7-3.4v-2.8c0-1.5.9-2.5 2.3-2.5z"
        />
        <g className="banner-ghost-hat">
          <path fill="#ECEAE6" d="M12.1 11.5C12.3 7.8 13.6 5.6 16 5.6s3.7 2.2 3.9 5.9h-7.8z" />
          <path
            fill="#ECEAE6"
            d="M6.3 12.5C8 10.9 10.8 10.2 16 10.2s8 .7 9.7 2.3c.5.5.2 1.2-.6 1.2H6.9c-.8 0-1.1-.7-.6-1.2z"
          />
          <rect x="12.3" y="10.15" width="7.4" height="1.15" rx="0.3" fill="#1a0b2e" />
        </g>
        <rect x="10.6" y="15.2" width="4.2" height="2.5" rx="0.7" fill="#1a0b2e" />
        <rect className="banner-ghost-wink" x="17.2" y="15.2" width="4.2" height="2.5" rx="0.7" fill="#1a0b2e" />
        <rect x="14.65" y="16" width="2.7" height="0.9" rx="0.3" fill="#1a0b2e" />
      </svg>
    </span>
  );
}

export function TopBanner() {
  return (
    <div className="top-banner flex h-14 shrink-0 items-center gap-3 px-4">
      <BannerGhost />
      <div className="min-w-0 leading-none">
        <p className="font-spooky text-2xl leading-none tracking-wide text-violet-100">YOUCOGNITO</p>
        <p className="mt-1 truncate text-xs text-mist">Private AI research on Base</p>
      </div>
    </div>
  );
}

function openExternal(url: string, inMiniApp: boolean) {
  if (!inMiniApp) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void import("@farcaster/miniapp-sdk")
    .then(({ sdk }) => sdk.actions.openUrl(url))
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}

function LinkTile({ href, thumb, title, sub }: { href: string; thumb: string; title: string; sub: string }) {
  const miniApp = useMiniApp();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="media-tile press"
      onClick={(event) => {
        if (!miniApp.inMiniApp) return;
        event.preventDefault();
        openExternal(href, true);
      }}
    >
      {thumb ? (
        <img src={thumb} alt="" width={40} height={40} className="media-thumb" />
      ) : (
        <span className="media-thumb grid place-items-center text-violet-200">
          <Play className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-mist">{sub}</span>
      </span>
    </a>
  );
}

/**
 * Optional background music. Off by default, starts only on a user tap, loops at
 * low volume, pauses while the tab is hidden, remembers on/off. Hides itself if
 * the audio file is missing or fails to load.
 */
function SoundtrackTile() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const wantOn = useRef(false);

  // Check the file exists before showing the tile (no download, HEAD only).
  useEffect(() => {
    let cancelled = false;
    fetch(SOUNDTRACK_SRC, { method: "HEAD" })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        if (!cancelled) setAvailable(r.ok && type.startsWith("audio/"));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio(SOUNDTRACK_SRC);
    audio.loop = true;
    audio.preload = "none";
    audio.volume = SOUNDTRACK_VOLUME;
    audio.addEventListener("error", () => {
      setPlaying(false);
      setAvailable(false);
    });
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("play", () => setPlaying(true));
    audioRef.current = audio;
    return audio;
  }, []);

  const start = useCallback(() => {
    const audio = getAudio();
    void audio.play().catch(() => setPlaying(false));
  }, [getAudio]);

  // If the visitor turned music on last time, resume on their first tap anywhere.
  useEffect(() => {
    if (!available) return;
    let pref: string | null = null;
    try {
      pref = window.localStorage.getItem(MUSIC_PREF_KEY);
    } catch {
      /* storage blocked */
    }
    if (pref !== "on") return;
    wantOn.current = true;
    const onFirstTap = () => {
      if (wantOn.current && !document.hidden) start();
    };
    window.addEventListener("pointerdown", onFirstTap, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", onFirstTap, { capture: true });
  }, [available, start]);

  // Pause while the tab is hidden; resume when it comes back if music is on.
  useEffect(() => {
    function onVisibility() {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) audio.pause();
      else if (wantOn.current) void audio.play().catch(() => undefined);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => () => audioRef.current?.pause(), []);

  if (!available) return null;

  function toggle() {
    const next = !playing;
    wantOn.current = next;
    try {
      window.localStorage.setItem(MUSIC_PREF_KEY, next ? "on" : "off");
    } catch {
      /* storage blocked */
    }
    if (next) start();
    else audioRef.current?.pause();
  }

  return (
    <button
      type="button"
      className="media-tile press text-left"
      aria-pressed={playing}
      aria-label={playing ? "Pause spooky soundtrack" : "Play spooky soundtrack"}
      onClick={toggle}
    >
      <span className="relative shrink-0">
        <img src={SOUNDTRACK_THUMB} alt="" width={40} height={40} className="media-thumb" />
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-violet-600 text-white shadow">
          {playing ? <Pause className="size-3" aria-hidden="true" /> : <Play className="size-3" aria-hidden="true" />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">Spooky soundtrack</span>
        <span className="block truncate text-xs text-mist">{playing ? "Playing, tap to pause" : "Off, tap to play"}</span>
      </span>
    </button>
  );
}

export function MediaRow() {
  return (
    <nav aria-label="Youcognito media" className="media-row shrink-0">
      <LinkTile href={GAME_URL} thumb={GAME_THUMB} title="Youcognito Run" sub="Play the minigame" />
      <SoundtrackTile />
      {YOUTUBE_SHORT.url ? (
        <LinkTile href={YOUTUBE_SHORT.url} thumb={YOUTUBE_SHORT.thumb} title={YOUTUBE_SHORT.title} sub="YouTube Short" />
      ) : null}
    </nav>
  );
}
