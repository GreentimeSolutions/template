import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Halloween cosmetics. Purely visual: nothing here touches faucet, wallet,
 * token or AI logic. Other components fire window events to trigger effects.
 */
export const CELEBRATE_EVENT = "youcog:celebrate";
export const BURN_STATIC_EVENT = "youcog:burn-static";

export function celebrate() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(CELEBRATE_EVENT));
}

export function burnStatic() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(BURN_STATIC_EVENT));
}

const GHOST_PATH =
  "M16 3c-6 0-10 4.6-10 10.6V28l3-2.4 3.4 2.6L16 25.6l3.6 2.6L23 25.6l3 2.4V13.6C26 7.6 22 3 16 3z";

function GhostOutline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d={GHOST_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <ellipse cx="12.6" cy="13.5" rx="1.5" ry="2" fill="currentColor" />
      <ellipse cx="19.4" cy="13.5" rx="1.5" ry="2" fill="currentColor" />
    </svg>
  );
}

function GhostSolid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d={GHOST_PATH} fill="#f3eefc" />
      <ellipse cx="12.6" cy="13.5" rx="1.6" ry="2.1" fill="#2a0d4a" />
      <ellipse cx="19.4" cy="13.5" rx="1.6" ry="2.1" fill="#2a0d4a" />
      <ellipse cx="16" cy="19" rx="1.4" ry="1.8" fill="#2a0d4a" />
    </svg>
  );
}

function Bat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 20" className={className} aria-hidden="true">
      <path
        fill="#1a0b2e"
        stroke="#a78bfa"
        strokeWidth="0.8"
        d="M20 6c1 0 1.6-2 2-3 .2 1 .3 2 .6 2.6C25 3 30 1.5 39 3c-3 1-4.4 3.6-4 7-2-1.6-4.6-1.8-6.4 0-1.8-1.4-4-1.2-5.6 1-1 1.2-2 3-3 4-1-1-2-2.8-3-4-1.6-2.2-3.8-2.4-5.6-1-1.8-1.8-4.4-1.6-6.4 0 .4-3.4-1-6-4-7 9-1.5 14 0 16.4 2.6.3-.6.4-1.6.6-2.6.4 1 1 3 2 3z"
      />
    </svg>
  );
}

const DRIFTERS = [
  { left: "6%", top: "14%", size: 46, dur: 26, delay: -3, op: 0.1 },
  { left: "72%", top: "9%", size: 34, dur: 31, delay: -12, op: 0.08 },
  { left: "40%", top: "32%", size: 58, dur: 37, delay: -7, op: 0.07 },
  { left: "84%", top: "44%", size: 40, dur: 29, delay: -18, op: 0.1 },
  { left: "12%", top: "58%", size: 52, dur: 34, delay: -22, op: 0.08 },
  { left: "58%", top: "66%", size: 30, dur: 24, delay: -5, op: 0.11 },
  { left: "28%", top: "82%", size: 44, dur: 40, delay: -15, op: 0.07 },
  { left: "90%", top: "78%", size: 36, dur: 27, delay: -9, op: 0.09 },
];

/** Fixed layer behind all content: drifting ghosts, a zoomer and bottom fog. */
export function HauntedBackdrop() {
  return (
    <div className="haunt-backdrop" aria-hidden="true">
      {DRIFTERS.map((g, i) => (
        <span
          key={i}
          className="haunt-drift"
          style={{
            left: g.left,
            top: g.top,
            width: g.size,
            height: g.size,
            opacity: g.op,
            animationDuration: `${g.dur}s`,
            animationDelay: `${g.delay}s`,
          }}
        >
          <GhostOutline className="size-full text-violet-100" />
        </span>
      ))}
      <span className="haunt-zoom">
        <GhostOutline className="size-full text-violet-100" />
      </span>
      <div className="haunt-fog">
        <div className="haunt-fog-layer" />
        <div className="haunt-fog-layer haunt-fog-layer-2" />
      </div>
    </div>
  );
}

type Floater = {
  id: number;
  kind: "ghost" | "bat";
  left: number;
  size: number;
  dur: number;
  delay: number;
  sway: number;
};

/** Ghosts and bats floating up the screen after a successful claim. */
export function ClaimCelebration() {
  const [floaters, setFloaters] = useState<Floater[]>([]);

  useEffect(() => {
    let seq = 0;
    let timer: number | undefined;
    function onCelebrate() {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const count = reduce ? 0 : 18;
      const next: Floater[] = Array.from({ length: count }, () => ({
        id: ++seq,
        kind: Math.random() < 0.55 ? "ghost" : "bat",
        left: 4 + Math.random() * 88,
        size: 22 + Math.random() * 22,
        dur: 2.4 + Math.random() * 1.6,
        delay: Math.random() * 0.9,
        sway: (Math.random() - 0.5) * 80,
      }));
      setFloaters(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFloaters([]), 5000);
    }
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
      window.clearTimeout(timer);
    };
  }, []);

  if (floaters.length === 0) return null;
  return (
    <div className="haunt-celebrate" aria-hidden="true">
      {floaters.map((f) => (
        <span
          key={f.id}
          className={
            f.kind === "bat" ? "haunt-float haunt-float-bat" : "haunt-float"
          }
          style={
            {
              left: `${f.left}%`,
              width: f.kind === "bat" ? f.size * 1.6 : f.size,
              height: f.size,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
              "--sway": `${f.sway}px`,
            } as CSSProperties
          }
        >
          {f.kind === "bat" ? (
            <Bat className="size-full" />
          ) : (
            <GhostSolid className="size-full" />
          )}
        </span>
      ))}
    </div>
  );
}

/** Brief TV static flash when the session is burned. */
export function BurnStatic() {
  const [on, setOn] = useState(0);
  useEffect(() => {
    let timer: number | undefined;
    function onBurn() {
      setOn((n) => n + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOn(0), 650);
    }
    window.addEventListener(BURN_STATIC_EVENT, onBurn);
    return () => {
      window.removeEventListener(BURN_STATIC_EVENT, onBurn);
      window.clearTimeout(timer);
    };
  }, []);
  if (!on) return null;
  return <div key={on} className="haunt-static" aria-hidden="true" />;
}

/** Tiny jack-o'-lantern for the header ghost. */
export function JackOLantern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 4.5c.2-1.4.9-2.3 2-2.7l.5 1c-.8.4-1.2 1-1.3 1.8z"
        fill="#5b8a3c"
      />
      <ellipse cx="12" cy="14" rx="9.5" ry="8" fill="#f97316" />
      <path
        d="M12 6c-2.2 0-3.4 3.6-3.4 8s1.2 8 3.4 8 3.4-3.6 3.4-8-1.2-8-3.4-8z"
        fill="#fb923c"
        opacity="0.55"
      />
      <path
        d="M7 11.5l2.4 1.6L7 14.2zM17 11.5l-2.4 1.6 2.4 1.1z"
        className="jack-glow"
        fill="#fde047"
      />
      <path
        d="M6.8 16.4c1.8 2 8.6 2 10.4 0l-1.6.2-.8 1-1.2-.9-1.6 1-1.6-1-1.2.9-.8-1z"
        className="jack-glow"
        fill="#fde047"
      />
    </svg>
  );
}

/** Wraps the claim button: glow, wobble and a ghost peeking over the top. */
export function HauntedButtonFrame({ children }: { children: ReactNode }) {
  return (
    <div className="haunt-btn-frame">
      <span className="haunt-peek" aria-hidden="true">
        <GhostSolid className="size-full" />
      </span>
      {children}
    </div>
  );
}
