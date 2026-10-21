import { LISTEN_TRACK_TITLE } from "@/constants/listen";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Pause, Pencil, Play } from "lucide-react";
import {
  DEEP_MISSION_THUMB,
  FAUCET_THUMB,
  GAME_THUMB,
  GAME_URL,
  SOUNDTRACK_THUMB,
  PROJECT_WALLETS,
  YOUTUBE_SHORT,
} from "@/constants/media";
import { GhostAvatar } from "@/components/youcog/ghost-avatar";
import { fileToSquareDataUrl, setGhostPfp, useGhostPfp } from "@/lib/youcog/ghost-pfp";
import { openExternal } from "@/lib/youcog/open-external";
import { toggleSoundtrack, useSoundtrack } from "@/lib/youcog/soundtrack";
import { useMiniApp } from "@/lib/youcog/use-miniapp";

export const OPEN_FAUCET_EVENT = "youcog:open-faucet";

type TipTarget = "deep" | "faucet" | "game" | "music" | "burn" | "rcst" | "short";
type Slide = { kind: "tip"; text: string; target: TipTarget } | { kind: "buy"; text: string };
type Buy = { tokens: number; usd: number; from: string; at: string };

/** Project-owned wallets never appear in buy slides (client-side guard too). */
const EXCLUDED = new Set(PROJECT_WALLETS.map((w) => w.toLowerCase()));

const SLIDE_MS = 5000;

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function compact(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function buyText(b: Buy) {
  return `Recent buy: ${compact(b.tokens)} YOUCOG, ${shortAddr(b.from)}, ${ago(b.at)}`;
}

/** First on-screen-rendered element for a tip target (skips display:none copies). */
export function findTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tip-target="${target}"]`);
  for (const el of all) if (el.getClientRects().length > 0) return el;
  return null;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function glow(el: HTMLElement) {
  el.classList.remove("tip-glow");
  void el.offsetWidth;
  el.classList.add("tip-glow");
  window.setTimeout(() => el.classList.remove("tip-glow"), 2600);
}

const FLY_SVG =
  '<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M16 3c-6 0-10 4.6-10 10.6V28l3-2.4 3.4 2.6L16 25.6l3.6 2.6L23 25.6l3 2.4V13.6C26 7.6 22 3 16 3z" fill="#f3eefc"/><path d="M4 10.6c2-1.6 5.6-2.4 12-2.4s10 .8 12 2.4c.5.5.2 1.2-.7 1.2H4.7c-.9 0-1.2-.7-.7-1.2z" fill="#fff"/><path d="M10.4 8.6c.4-3.6 2.4-5.6 5.6-5.6s5.2 2 5.6 5.6z" fill="#fff"/><rect x="10.6" y="7.2" width="10.8" height="1.4" fill="#2a0d4a"/><rect x="9.6" y="13" width="5.2" height="2.8" rx=".9" fill="#2a0d4a"/><rect x="17.2" y="13" width="5.2" height="2.8" rx=".9" fill="#2a0d4a"/></svg>';

/** A small ghost flies from the big ghost to the target, nods twice, and drifts back. */
function flyGhost(from: HTMLElement, target: HTMLElement) {
  glow(target);
  if (reducedMotion()) return;
  const size = 36;
  const f = from.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = f.left + f.width * 0.7 - size / 2;
  const sy = f.top + f.height * 0.25 - size / 2;
  let dx: number;
  let dy: number;
  let point = "";
  const onScreen = t.bottom > 0 && t.top < vh && t.right > 0 && t.left < vw;
  if (onScreen) {
    dx = t.left - size - 6;
    if (dx < 4) dx = Math.min(vw - size - 4, t.right + 6);
    dy = Math.min(vh - size - 4, Math.max(4, t.top + Math.min(t.height, 80) / 2 - size / 2));
  } else {
    dx = Math.min(vw - size - 8, Math.max(8, t.left + t.width / 2 - size / 2));
    dy = t.top >= vh ? vh - size - 18 : 18;
    point = t.top >= vh ? "down" : "up";
  }
  const el = document.createElement("span");
  el.className = `fly-ghost${point ? ` fly-ghost-${point}` : ""}`;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = FLY_SVG;
  document.body.appendChild(el);
  const at = (x: number, y: number, r = 0, s = 1) => `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
  const anim = el.animate(
    [
      { transform: at(sx, sy, 0, 0.5), opacity: 0, offset: 0 },
      { transform: at(sx, sy, -8, 0.9), opacity: 1, offset: 0.05 },
      { transform: at((sx + dx) / 2, Math.min(sy, dy) - 40, 10, 1), opacity: 1, offset: 0.17 },
      { transform: at(dx, dy, 0, 1), opacity: 1, offset: 0.3 },
      { transform: at(dx, dy + 3, 18, 1), offset: 0.37 },
      { transform: at(dx, dy, 0, 1), offset: 0.44 },
      { transform: at(dx, dy + 3, 18, 1), offset: 0.51 },
      { transform: at(dx, dy, 0, 1), opacity: 1, offset: 0.62 },
      { transform: at(dx, dy - 4, -4, 1), opacity: 0.9, offset: 0.75 },
      { transform: at(sx, sy, 0, 0.6), opacity: 0, offset: 1 },
    ],
    { duration: 3600, easing: "ease-in-out", fill: "forwards" },
  );
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

function goTo(target: TipTarget, inMiniApp: boolean) {
  if (target === "faucet") {
    window.dispatchEvent(new Event(OPEN_FAUCET_EVENT));
    return;
  }
  if (target === "game") {
    openExternal(GAME_URL, inMiniApp);
    return;
  }
  if (target === "short") {
    if (YOUTUBE_SHORT.url) openExternal(YOUTUBE_SHORT.url, inMiniApp);
    return;
  }
  if (target === "music") {
    toggleSoundtrack();
    return;
  }
  const el =
    target === "deep" ? (document.getElementById("deep-mission") ?? findTarget("deep")) : findTarget(target);
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  glow(el);
}

function GridTile({
  target,
  thumb,
  label,
  onClick,
  className = "",
  badge,
  ariaLabel,
}: {
  target: TipTarget;
  thumb: string;
  label: string;
  onClick: () => void;
  className?: string;
  badge?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      data-tip-target={target}
      aria-label={ariaLabel ?? label}
      className={`grid-tile press ${className}`}
      onClick={onClick}
    >
      <img src={thumb} alt="" draggable={false} className="size-full object-cover" />
      <span className="grid-tile-label">{label}</span>
      {badge}
    </button>
  );
}

function ChangeGhostMenu({ onClose }: { onClose: () => void }) {
  const miniApp = useMiniApp();
  const pfpUrl = miniApp.user?.pfpUrl;
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setGhostPfp(await fileToSquareDataUrl(file));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture could not be used.");
    }
  }

  return (
    <div className="ghost-menu" role="menu" aria-label="Change ghost">
      <p className="px-2 pb-1 text-xs text-faint">Change ghost (stays on this device)</p>
      {pfpUrl ? (
        <button
          type="button"
          role="menuitem"
          className="ghost-menu-item"
          onClick={() => {
            setGhostPfp(pfpUrl);
            onClose();
          }}
        >
          Use my Farcaster pfp
        </button>
      ) : null}
      <button type="button" role="menuitem" className="ghost-menu-item" onClick={() => fileRef.current?.click()}>
        Upload a picture
      </button>
      <button
        type="button"
        role="menuitem"
        className="ghost-menu-item"
        onClick={() => {
          setGhostPfp(null);
          onClose();
        }}
      >
        Reset to Youcog
      </button>
      {error ? <p className="px-2 pt-1 text-xs text-danger">{error}</p> : null}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}

/** Home hero: interactive ghost with a speech-bubble slideshow, plus the quick-tile grid. */
export function GhostStage({ compact: small = false }: { compact?: boolean }) {
  const miniApp = useMiniApp();
  const music = useSoundtrack();
  const pfp = useGhostPfp();
  const stageRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLButtonElement>(null);
  const [buys, setBuys] = useState<Buy[]>([]);
  const [index, setIndex] = useState(0);
  const [wiggle, setWiggle] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasRcst, setHasRcst] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/buys")
        .then((r) => (r.ok ? r.json() : { buys: [] }))
        .then((d: { buys?: Buy[] }) => {
          if (cancelled) return;
          const list = Array.isArray(d.buys) ? d.buys : [];
          setBuys(list.filter((b) => b.from && !EXCLUDED.has(b.from.toLowerCase())).slice(0, 10));
        })
        .catch(() => undefined);
    void load();
    const id = window.setInterval(load, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setHasRcst(Boolean(findTarget("rcst")));
  }, []);

  const slides = useMemo<Slide[]>(() => {
    const tips: Slide[] = [
      { kind: "tip", text: "Hold 10M YOUCOG to unlock Deep Mission.", target: "deep" },
      { kind: "tip", text: "Check in at the daily YOUCOG faucet.", target: "faucet" },
      { kind: "tip", text: `Finish ${LISTEN_TRACK_TITLE} to unlock a bigger faucet gift today.`, target: "faucet" },
      { kind: "tip", text: "Play Youcognito Run.", target: "game" },
    ];
    if (YOUTUBE_SHORT.url) tips.push({ kind: "tip", text: "Watch the Youcognito Short.", target: "short" });
    if (music.available) tips.push({ kind: "tip", text: "Turn on the spooky soundtrack.", target: "music" });
    tips.push({ kind: "tip", text: "Burn your session when you're done, no trace.", target: "burn" });
    if (hasRcst) tips.push({ kind: "tip", text: "Quote-cast the launch for 1,111 $RCST.", target: "rcst" });
    const out: Slide[] = [];
    tips.forEach((tip, i) => {
      out.push(tip);
      if (i % 2 === 1 && buys.length > 0) out.push({ kind: "buy", text: "" });
    });
    return out;
  }, [buys, music.available, hasRcst]);

  const current = slides[index % slides.length];
  // Each buy slide shows a random one of the latest outside buys.
  const slide = useMemo<Slide | undefined>(() => {
    if (!current || current.kind !== "buy" || buys.length === 0) return current;
    return { kind: "buy", text: buyText(buys[Math.floor(Math.random() * buys.length)]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, buys, index]);

  const advance = useCallback(() => setIndex((i) => (i + 1) % Math.max(1, slides.length)), [slides.length]);

  // Auto-advance every ~5s while this copy of the stage is actually rendered.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (document.hidden || !stageRef.current?.getClientRects().length) {
        setIndex((i) => i);
        return;
      }
      advance();
    }, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, advance]);

  // Fly a little ghost to the feature each tip is about.
  useEffect(() => {
    if (!slide || slide.kind !== "tip") return;
    if (document.hidden || !stageRef.current?.getClientRects().length || !ghostRef.current) return;
    const target = findTarget(slide.target);
    const from = ghostRef.current;
    if (!target) return;
    const id = window.setTimeout(() => flyGhost(from, target), 350);
    return () => window.clearTimeout(id);
  }, [slide, index]);

  const size = small ? "size-36" : "size-52";

  return (
    <div ref={stageRef} className="flex flex-col gap-2" data-testid="ghost-stage">
      {slide ? (
        <button
          type="button"
          className="ghost-bubble press"
          aria-live="polite"
          onClick={() => {
            if (slide.kind === "tip") goTo(slide.target, miniApp.inMiniApp);
            advance();
          }}
        >
          <span key={index} className="ghost-bubble-text">
            {slide.kind === "buy" ? <span className="mr-1 text-emerald-300">●</span> : null}
            {slide.text}
          </span>
        </button>
      ) : null}
      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <button
            ref={ghostRef}
            type="button"
            aria-label="Poke Youcog"
            className={`ghost-bob block ${size}`}
            onClick={() => {
              setWiggle((w) => w + 1);
              advance();
            }}
          >
            <GhostAvatar
              key={wiggle}
              src={pfp}
              className={`${size} ${wiggle ? "ghost-wiggle" : ""}`}
            />
          </button>
          <button
            type="button"
            aria-label="Change ghost"
            aria-expanded={menuOpen}
            className="absolute top-1.5 right-1.5 z-10 grid size-8 place-items-center rounded-full border border-line-strong bg-canvas/85 text-violet-100 shadow"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
          {menuOpen ? <ChangeGhostMenu onClose={() => setMenuOpen(false)} /> : null}
        </div>
        <div className={`home-grid ${small ? "h-36" : "h-52"}`}>
          <GridTile
            target="game"
            thumb={GAME_THUMB}
            label="Run"
            ariaLabel="Play Youcognito Run"
            onClick={() => openExternal(GAME_URL, miniApp.inMiniApp)}
          />
          {music.available ? (
            <GridTile
              target="music"
              thumb={SOUNDTRACK_THUMB}
              label={music.playing ? "Playing" : "Music"}
              ariaLabel={music.playing ? "Pause spooky soundtrack" : "Play spooky soundtrack"}
              onClick={toggleSoundtrack}
              badge={
                <span className="grid-tile-badge">
                  {music.playing ? <Pause className="size-3" aria-hidden="true" /> : <Play className="size-3" aria-hidden="true" />}
                </span>
              }
            />
          ) : null}
          <GridTile
            target="deep"
            thumb={DEEP_MISSION_THUMB}
            label="Hold 10M"
            ariaLabel="Deep Mission: hold 10M YOUCOG"
            onClick={() => goTo("deep", miniApp.inMiniApp)}
          />
          <GridTile
            target="faucet"
            thumb={FAUCET_THUMB}
            label="Faucet"
            ariaLabel="Open the daily YOUCOG faucet"
            onClick={() => goTo("faucet", miniApp.inMiniApp)}
          />
          {YOUTUBE_SHORT.url ? (
            <GridTile
              target="short"
              thumb={YOUTUBE_SHORT.thumbTall || YOUTUBE_SHORT.thumb}
              label="Short"
              ariaLabel={YOUTUBE_SHORT.title}
              className="grid-tile-tall"
              onClick={() => openExternal(YOUTUBE_SHORT.url, miniApp.inMiniApp)}
              badge={
                <span className="grid-tile-badge">
                  <Play className="size-3" aria-hidden="true" />
                </span>
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
