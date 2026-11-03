import { COLORS, GHOST } from "@/lib/youcog/ghost-sprite";
import type { FlameTier } from "@/lib/youcog/streak-flames";

// palette per tier: [outer, mid, core]
const PAL: Record<number, [string, string, string]> = {
  1: ["#f5b301", "#ffe27a", "#ffffff"],
  2: ["#e8590c", "#ff9f1c", "#ffe27a"],
  3: ["#1f4fff", "#5b8cff", "#d6e4ff"],
  4: ["#6a1fd1", "#a35bff", "#ead6ff"],
  5: ["#b80d0d", "#ff3b1f", "#ffcf5b"],
};
// flame height/width in pixel cells per tier
const SIZE: Record<number, [number, number]> = { 1: [4, 3], 2: [8, 6], 3: [10, 7], 4: [13, 9], 5: [14, 16] };
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Draw a flame (or tier-5 ghost in flame) into a grid of `cols`x`rows` cells of `px` each. */
export function drawFlame(ctx: CanvasRenderingContext2D, tier: FlameTier, t: number, cols: number, rows: number, px: number) {
  ctx.clearRect(0, 0, cols * px, rows * px);
  if (!tier) return;
  const [o, m, c] = PAL[tier];
  const [fh, fw] = SIZE[tier];
  const cx = cols / 2;
  const base = rows - 1;
  const cell = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x) * px, Math.round(y) * px, px, px);
  };
  if (tier === 1) {
    // spark: a twinkling plus with a few embers
    const k = Math.floor(t / 160) % 3;
    const y = base - 2;
    cell(cx, y, c);
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => cell(cx + dx, y + dy, k === 1 ? m : o));
    if (k !== 2) cell(cx + (k ? 1.6 : -1.6), y - 2, m);
    return;
  }
  for (let y = 0; y < fh; y++) {
    const f = y / fh; // 0 bottom .. 1 top
    const sway = Math.sin(t / 140 + y * 0.7) * f * 1.4;
    const half = (fw / 2) * (f < 0.3 ? 0.75 + f : Math.pow((1 - f) / 0.7, 0.9)) * (0.9 + 0.1 * Math.sin(t / 90 + y));
    for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
      if (Math.abs(dx) > half) continue;
      const r = Math.abs(dx) / Math.max(1, half);
      const col = r < 0.4 && f < 0.55 ? c : r < 0.75 && f < 0.8 ? m : o;
      cell(cx + dx + sway - 0.5, base - y, col);
    }
  }
  // embers
  for (let i = 0; i < tier; i++) {
    const p = ((t / 900 + i / tier) % 1);
    cell(cx + Math.sin(i * 2.3 + t / 300) * fw * 0.45, base - fh * (0.6 + p * 0.5), p > 0.6 ? o : m);
  }
  if (tier === 5) {
    // red-hot ghost wrapped in the flame
    const gx = Math.round(cx - 8);
    const gy = base - 15;
    GHOST.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const col = ch === "G" ? (y > 9 ? "#ffcf5b" : "#ffe9d6") : COLORS[ch];
        cell(gx + x, gy + y, ch === "L" ? "#ff3b1f" : col);
      }),
    );
    // flame tongues licking up both sides and over the hat
    for (const side of [-1, 1]) {
      // 2-cell-wide tongues (inner bright, outer dark) so they read at 40px
      const inner = side < 0 ? gx - 1 : gx + 16;
      const outer = inner + side;
      const h = 12 + Math.round(2 * Math.sin(t / 120 + side));
      for (let y = 0; y < h; y++) {
        const top = y >= h - 3;
        cell(inner, base - y, y < h * 0.45 ? c : m);
        if (!top || y === h - 3) cell(outer, base - y, y < h * 0.6 ? m : o);
        if (top && y === h - 1) cell(inner - side, base - y, o); // tip curls toward the ghost
      }
    }
    for (let i = 0; i < 4; i++) cell(gx + 3 + i * 3, gy - 1 - (Math.floor(t / 110 + i) % 2), i % 2 ? m : o);
  }
}

