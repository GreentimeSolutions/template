import { useEffect, useRef, useState } from "react";
import { drawFlame, reducedMotion } from "@/lib/youcog/streak-flames-draw";
import { forgeClaimEnabled } from "@/lib/youcog/forge-claim";
import { FORGE_CLAIM_DONE, STREAK_LEVELUP, tierName, type FlameTier, type LevelUp } from "@/lib/youcog/streak-flames";

/**
 * Pixel streak flame + tier-unlock overlay. Cosmetic only: shows the real streak
 * passed in by the faucet card. Behind VITE_STREAK_FLAMES === "1".
 */

export function StreakFlame({ streak, tier, size = 48 }: { streak: number; tier: FlameTier; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const cols = 20;
    const px = Math.max(1, Math.floor((size * Math.min(2, window.devicePixelRatio || 1)) / cols));
    cv.width = cv.height = cols * px;
    if (reducedMotion()) return drawFlame(ctx, tier, 0, cols, cols, px);
    let id = 0;
    const loop = (now: number) => {
      drawFlame(ctx, tier, now, cols, cols, px);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [tier, size]);
  return (
    <canvas
      ref={ref}
      data-testid="streak-flame"
      data-tier={tier}
      role="img"
      aria-label={`${tierName(tier).toLowerCase()} for a ${streak}-day streak`}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}

/** Tier-unlock moment (~2.6s, tap/Escape to skip). Waits for the Forge cinematic to close when that is on. */
export function StreakLevelUp() {
  const [show, setShow] = useState<LevelUp | null>(null);
  const [t0, setT0] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let pending: LevelUp | null = null;
    let fallback = 0;
    const open = (d: LevelUp) => {
      pending = null;
      window.clearTimeout(fallback);
      setT0(performance.now());
      setShow(d);
    };
    const onLevel = (e: Event) => {
      const d = (e as CustomEvent<LevelUp>).detail;
      if (!forgeClaimEnabled()) return open(d);
      pending = d;
      fallback = window.setTimeout(() => pending && open(pending), 15000);
    };
    const onForgeDone = () => pending && open(pending);
    window.addEventListener(STREAK_LEVELUP, onLevel);
    window.addEventListener(FORGE_CLAIM_DONE, onForgeDone);
    return () => {
      window.removeEventListener(STREAK_LEVELUP, onLevel);
      window.removeEventListener(FORGE_CLAIM_DONE, onForgeDone);
      window.clearTimeout(fallback);
    };
  }, []);
  useEffect(() => {
    if (!show) return;
    const dur = show.kind === "reset" ? 2600 : 2800;
    const close = window.setTimeout(() => setShow(null), dur);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(null);
    window.addEventListener("keydown", onKey);
    let id = 0;
    if (!reducedMotion()) {
      const tick = (n: number) => {
        setNow(n);
        id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
    }
    return () => {
      window.clearTimeout(close);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(id);
    };
  }, [show]);
  if (!show) return null;
  const p = reducedMotion() ? 1 : Math.min(1, Math.max(0, (now - t0) / 500));
  if (show.kind === "reset") {
    return (
      <div role="status" data-testid="streak-reset" onClick={() => setShow(null)}
        className="fixed inset-x-4 bottom-6 z-[60] rounded-seal border border-line bg-[#0a0f2c] px-4 py-3 text-center text-sm text-[#d6e4ff] shadow-lg"
        style={{ opacity: p }}>
        Streak reset. Start a new flame today.
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" data-testid="streak-levelup" onClick={() => setShow(null)}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0a0f2c]/90"
      style={{ opacity: p, fontFamily: "ui-monospace, monospace", backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)" }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * p})` }}>
        <StreakFlame streak={show.streak} tier={show.tier} size={160} />
      </div>
      <p className="mt-4 text-xs tracking-[0.3em] text-[#f5b301]">STREAK LEVEL UP</p>
      <p className="mt-1 text-2xl font-bold tracking-widest text-white">{tierName(show.tier)}</p>
      <p className="mt-1 text-sm tracking-widest text-[#5b8cff]">{show.streak} DAYS</p>
      <p className="mt-6 text-[10px] text-[#8892b0]">tap to continue</p>
    </div>
  );
}
