import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CELEBRATE_EVENT, type CelebrateDetail } from "@/lib/youcog/celebrate";

/**
 * Full-screen ghost celebration after a confirmed reward (faucet claim, survey
 * reward, listen boost). Purely cosmetic: it only reads the event detail the
 * caller passes (the real amount from the API) and never touches claim logic.
 * Tap anywhere or press Escape to dismiss; it also clears itself after ~2.5s.
 */
const SHOW_MS = 2400;
const REDUCED_SHOW_MS = 3200;
const FADE_MS = 320;

type Particle = { id: number; kind: "coin" | "spark"; dx: number; dy: number; size: number; delay: number; spin: number };

function makeParticles(): Particle[] {
  const out: Particle[] = [];
  const coins = 14;
  const sparks = 16;
  for (let i = 0; i < coins + sparks; i++) {
    const coin = i < coins;
    const a = (i / (coin ? coins : sparks)) * Math.PI * 2 + Math.random() * 0.5;
    const r = (coin ? 120 : 90) + Math.random() * (coin ? 70 : 110);
    out.push({
      id: i,
      kind: coin ? "coin" : "spark",
      dx: Math.cos(a) * r,
      dy: Math.sin(a) * r * 0.85 - (coin ? 30 : 10),
      size: coin ? 22 + Math.random() * 10 : 8 + Math.random() * 10,
      delay: 0.28 + Math.random() * 0.25,
      spin: (Math.random() - 0.5) * 540,
    });
  }
  return out;
}

async function successHaptic() {
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    if (!(await sdk.isInMiniApp())) return;
    const caps = await sdk.getCapabilities().catch(() => [] as string[]);
    if (!caps.includes("haptics.notificationOccurred")) return;
    await sdk.haptics.notificationOccurred("success");
  } catch {
    /* haptics are a nice-to-have */
  }
}

function useCountUp(target: number | undefined, run: boolean, ms = 700) {
  const [n, setN] = useState(target ?? 0);
  useEffect(() => {
    if (target === undefined) return;
    if (!run) {
      setN(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + 250; // start as the number pops in
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return n;
}

type Shown = CelebrateDetail & { key: number; reduced: boolean };

export function GhostCelebration() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);

  function clearTimers() {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }

  function dismiss() {
    clearTimers();
    setLeaving(true);
    timers.current.push(
      window.setTimeout(() => {
        setShown(null);
        setLeaving(false);
      }, FADE_MS),
    );
  }

  useEffect(() => {
    function onCelebrate(e: Event) {
      const detail = (e as CustomEvent<CelebrateDetail | undefined>).detail;
      if (!detail || (detail.amount === undefined && !detail.title)) return; // legacy bare event: floaters only
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      clearTimers();
      setLeaving(false);
      setParticles(reduced ? [] : makeParticles());
      setShown({ ...detail, key: ++seq.current, reduced });
      void successHaptic();
      timers.current.push(window.setTimeout(dismiss, reduced ? REDUCED_SHOW_MS : SHOW_MS));
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
      window.removeEventListener("keydown", onKey);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = useCountUp(shown?.amount, Boolean(shown && !shown.reduced));
  if (!shown) return null;

  const label = shown.title ?? "YOUCOG";
  return (
    <div
      key={shown.key}
      className={`ghost-cel${shown.reduced ? " is-reduced" : ""}${leaving ? " is-leaving" : ""}`}
      onClick={dismiss}
      data-testid="ghost-celebration"
    >
      <div className="ghost-cel-veil" aria-hidden="true" />
      <div className="ghost-cel-stage" aria-hidden="true">
        <span className="ghost-cel-burst" />
        <span className="ghost-cel-ring" />
        <span className="ghost-cel-ring ghost-cel-ring-2" />
        {particles.map((p) => (
          <span
            key={p.id}
            className={p.kind === "coin" ? "ghost-cel-coin" : "ghost-cel-spark"}
            style={
              {
                width: p.size,
                height: p.size,
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                "--spin": `${p.spin}deg`,
                animationDelay: `${p.delay}s`,
              } as CSSProperties
            }
          >
            {p.kind === "coin" ? "Y" : null}
          </span>
        ))}
        <div className="ghost-cel-ghost">
          <img src="/ghost-celebrate.webp" alt="" width={320} height={385} draggable={false} />
          <span className="ghost-cel-glint" />
        </div>
      </div>
      <div className="ghost-cel-text" role="status" aria-live="polite">
        {shown.amount !== undefined ? (
          <>
            <p className="ghost-cel-amount">+{count.toLocaleString("en-US")}</p>
            <p className="ghost-cel-unit">YOUCOG</p>
            <span className="sr-only">
              {`Received ${shown.amount.toLocaleString("en-US")} YOUCOG.`}
            </span>
          </>
        ) : (
          <p className="ghost-cel-amount ghost-cel-title">{label}</p>
        )}
        {shown.subtitle ? <p className="ghost-cel-sub">{shown.subtitle}</p> : null}
        <p className="ghost-cel-hint">Tap to close</p>
      </div>
    </div>
  );
}
