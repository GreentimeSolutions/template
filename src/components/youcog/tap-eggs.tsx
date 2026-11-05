import { useEffect, useState } from "react";

/** Easter egg: tap empty space for a ghost puff; about 1 in 20 taps is a rare golden ghost. Visual only. */
type Puff = { id: number; x: number; y: number; rare: boolean };
const SKIP = "a,button,input,textarea,select,label,summary,iframe,video,canvas,[role=button],[data-no-egg]";
export function TapEggs() {
  const [puffs, setPuffs] = useState<Puff[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(SKIP)) return;
      const p = { id: ++n, x: e.clientX, y: e.clientY, rare: Math.random() < 0.05 };
      setPuffs((s) => [...s.slice(-5), p]);
      setTimeout(() => setPuffs((s) => s.filter((q) => q.id !== p.id)), p.rare ? 2200 : 1100);
    };
    window.addEventListener("pointerdown", on);
    return () => window.removeEventListener("pointerdown", on);
  }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
      {puffs.map((p) => (
        <span key={p.id} data-egg={p.rare ? "rare" : "puff"} className={`tap-puff ${p.rare ? "tap-puff-rare" : ""}`} style={{ left: p.x, top: p.y }}>
          {p.rare ? "✨👻✨" : "👻"}
        </span>
      ))}
    </div>
  );
}
