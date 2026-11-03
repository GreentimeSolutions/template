import { useEffect, useRef, useState } from "react";
import {
  FORGE_CLAIM_RESOLVE,
  FORGE_CLAIM_START,
  type ForgeClaimResolve,
  type ForgeClaimStart,
} from "@/lib/youcog/forge-claim";
import { COLORS, GHOST } from "@/lib/youcog/ghost-sprite";
import { FORGE_CLAIM_DONE } from "@/lib/youcog/streak-flames";

/**
 * Forge claim cinematic: a pixel spy ghost whose laser eyes "write" the claim
 * code, a deploy bar that waits on the real faucet response, then a beam to the
 * wallet, coin burst, and the real amount + streak. Canvas only, ~5s, tap to skip.
 * Cosmetic: it only displays what the caller passes from the API.
 */

// 16x14 ghost sprite. H=hat, B=band, G=body, S=shades, L=lens glint, .=empty
// eye centers in sprite cells
const EYES: [number, number][] = [[5, 6], [10, 6]];

const T = { fade: 450, charge: 1000, type0: 1050, perLine: 560, minDeploy: 3200, beam: 450, reveal: 2300 };

type Run = { start: ForgeClaimStart; t0: number; res?: ForgeClaimResolve; tRes?: number; reduced: boolean };

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function ForgeClaim() {
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const onStart = (e: Event) => {
      const start = (e as CustomEvent<ForgeClaimStart>).detail;
      const r: Run = { start, t0: performance.now(), reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
      runRef.current = r;
      setRun(r);
    };
    const onResolve = (e: Event) => {
      const r = runRef.current;
      if (!r || r.res) return;
      r.res = (e as CustomEvent<ForgeClaimResolve>).detail;
      r.tRes = performance.now();
      setRun({ ...r });
      runRef.current = r;
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener(FORGE_CLAIM_START, onStart);
    window.addEventListener(FORGE_CLAIM_RESOLVE, onResolve);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(FORGE_CLAIM_START, onStart);
      window.removeEventListener(FORGE_CLAIM_RESOLVE, onResolve);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function close() {
    if (runRef.current) window.dispatchEvent(new CustomEvent(FORGE_CLAIM_DONE));
    runRef.current = null;
    setRun(null);
  }

  useEffect(() => {
    if (!run || run.reduced) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const amt = run.start.amount.toLocaleString("en-US");
    const lines = [
      `> claim(you)`,
      `> verify streak${run.start.streakDay ? ` // day ${run.start.streakDay}` : ""}`,
      `> mint ${amt} -> ${short(run.start.address)}`,
      `> deploy --chain base`,
    ];
    const px = Math.max(5, Math.floor(Math.min(W, 420) / 40)); // sprite cell size
    const gx = W / 2 - 8 * px;
    const gy = H * 0.14;
    const codeX = Math.max(16, W / 2 - 170);
    const codeY = gy + 14 * px + 46;
    const lineH = 26;
    const walletX = W / 2;
    const walletY = H * 0.74;
    const stars = Array.from({ length: 50 }, () => [Math.random() * W, Math.random() * H, Math.random()]);
    const coins = Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      const s = 2.2 + Math.random() * 2.4;
      return [Math.cos(a) * s, Math.sin(a) * s - 2.2, Math.random() * 6];
    });
    let raf = 0;
    let closeAt = 0;

    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const text = (s: string, x: number, y: number, size: number, c: string, align: CanvasTextAlign = "left", glow = 0) => {
      ctx.font = `bold ${size}px ui-monospace, "Courier New", monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.shadowColor = c;
      ctx.shadowBlur = glow;
      ctx.fillStyle = c;
      ctx.fillText(s, x, y);
      ctx.shadowBlur = 0;
    };
    const beam = (x1: number, y1: number, x2: number, y2: number, c: string, w: number) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.shadowColor = c;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, w / 3);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    const eyePos = (i: number) => [gx + (EYES[i][0] + 0.5) * px, gy + (EYES[i][1] + 0.5) * px];

    const frame = (now: number) => {
      const r = runRef.current;
      if (!r) return;
      const t = now - r.t0;
      ctx.clearRect(0, 0, W, H);
      rect(0, 0, W, H, `rgba(2,4,18,${Math.min(1, t / 300)})`);
      for (const [sx, sy, sp] of stars) if ((Math.floor(now / 300 + sp * 10) % 4) !== 0) rect(sx, sy, 2, 2, sp > 0.5 ? "#5b8cff" : "#ffd24a");
      // scanlines
      ctx.globalAlpha = 0.06;
      for (let y = 0; y < H; y += 4) rect(0, y, W, 1, "#fff");
      ctx.globalAlpha = 1;

      const failed = r.res && !r.res.ok;
      const tDone = r.res && r.tRes !== undefined ? Math.max(r.tRes - r.t0, T.minDeploy) : Infinity;

      // ghost
      const fade = Math.min(1, t / T.fade);
      const bob = Math.sin(t / 260) * px * 0.4;
      ctx.globalAlpha = fade;
      GHOST.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === ".") return;
          let c = COLORS[ch];
          if (ch === "G" && (x === 1 || y === 4 || y >= 11)) c = "#c9d6ff";
          if (ch === "H" && (y === 3 && (x < 2 || x > 13))) c = "#c9d6ff"; // pixel shading
          if (ch === "L" && t > T.fade) c = Math.floor(t / 90) % 2 ? "#ff2d55" : "#ff9a3c";
          rect(gx + x * px, gy + y * px + bob, px + 0.5, px + 0.5, c);
        }),
      );
      ctx.globalAlpha = 1;
      // eye charge
      if (t > T.fade) {
        const ch = Math.min(1, (t - T.fade) / (T.charge - T.fade));
        EYES.forEach((_, i) => {
          const [ex, ey] = eyePos(i);
          ctx.fillStyle = i ? "rgba(0,82,255,0.55)" : "rgba(255,45,85,0.55)";
          ctx.shadowColor = i ? "#3d7bff" : "#ff2d55";
          ctx.shadowBlur = 20 * ch;
          ctx.beginPath();
          ctx.arc(ex, ey + bob, px * 0.4 + ch * px * (0.8 + 0.2 * Math.sin(t / 40)), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        if (t < T.charge) text("CHARGING…", W / 2, gy - 22, 13, "#ff9a3c", "center", 8);
      }

      // code typing with laser beams
      const typeEnd = T.type0 + lines.length * T.perLine;
      lines.forEach((ln, i) => {
        const ls = T.type0 + i * T.perLine;
        if (t < ls) return;
        const n = Math.min(ln.length, Math.floor(((t - ls) / (T.perLine * 0.8)) * ln.length));
        const shown = ln.slice(0, n);
        const y = codeY + i * lineH;
        text(shown, codeX, y, 15, i === 2 ? "#ffd24a" : "#7cf7c4", "left", 6);
        ctx.font = `bold 15px ui-monospace, "Courier New", monospace`;
        const cx = codeX + ctx.measureText(shown).width;
        if (n < ln.length && t < typeEnd && t < tDone) {
          EYES.forEach((_, k) => {
            const [ex, ey] = eyePos(k);
            beam(ex, ey + bob, cx + 2, y, k ? "#3d7bff" : "#ff2d55", 3);
          });
          for (let s = 0; s < 4; s++) rect(cx + Math.random() * 10 - 3, y + Math.random() * 12 - 6, 2, 2, "#fff");
        }
        if (n < ln.length && Math.floor(t / 120) % 2) rect(cx + 2, y - 8, 8, 16, "#7cf7c4");
      });

      // deploy progress bar
      if (t > T.type0) {
        const by = codeY + lines.length * lineH + 18;
        const bw = Math.min(340, W - 32);
        const bx = W / 2 - bw / 2;
        let p = Math.min(0.9, ((t - T.type0) / (T.minDeploy - T.type0)) * 0.9);
        if (r.res) p = Math.min(1, 0.9 + (t - Math.max(r.tRes! - r.t0, T.type0)) / 300);
        if (!r.res && t > T.minDeploy) p = 0.9 + 0.05 * (1 - Math.exp(-(t - T.minDeploy) / 3000));
        rect(bx - 3, by - 3, bw + 6, 22, "#0052ff");
        rect(bx, by, bw, 16, "#020412");
        const segs = Math.floor((bw / 12) * p);
        for (let s = 0; s < segs; s++) rect(bx + 2 + s * 12, by + 2, 9, 12, failed ? "#ff2d55" : s % 2 ? "#3d7bff" : "#5b8cff");
        const label = failed ? "DEPLOY FAILED" : r.res ? "DEPLOYED ✓" : t > T.minDeploy ? "CONFIRMING ON BASE…" : `DEPLOYING ${Math.floor(p * 100)}%`;
        text(label, W / 2, by + 36, 13, failed ? "#ff2d55" : "#ffd24a", "center", 6);
      }

      // failure: hold briefly, then close; the form shows the real reason
      if (failed) {
        const reason = (r.res as { reason?: string }).reason;
        text("Claim didn't go through", W / 2, walletY, 18, "#fff", "center");
        if (reason) text(reason.slice(0, 42), W / 2, walletY + 28, 12, "#c9d6ff", "center");
        if (!closeAt) closeAt = now + 1800;
      }

      // success: beam to wallet, coin burst, amount + streak
      if (r.res?.ok && t >= tDone) {
        const tb = t - tDone;
        // wallet icon
        const ww = 72;
        const wx = walletX - ww / 2;
        const pulse = tb > T.beam ? 1 + 0.08 * Math.sin((tb - T.beam) / 60) * Math.exp(-(tb - T.beam) / 400) : 1;
        const wh = 50 * pulse;
        rect(wx - 3, walletY - wh / 2 - 3, ww * pulse + 6, wh + 6, "#ffd24a");
        rect(wx, walletY - wh / 2, ww * pulse, wh, "#0052ff");
        rect(wx + ww * pulse - 22, walletY - 8, 22, 16, "#0a0f2c");
        rect(wx + ww * pulse - 14, walletY - 3, 6, 6, "#ffd24a");
        text(short(r.start.address), walletX, walletY + 44, 12, "#c9d6ff", "center");
        if (tb < T.beam + 150) {
          const k = Math.min(1, tb / T.beam);
          EYES.forEach((_, i) => {
            const [ex, ey] = eyePos(i);
            beam(ex, ey + bob, ex + (walletX - ex) * k, ey + (walletY - ey) * k, i ? "#3d7bff" : "#ff2d55", 6);
          });
        }
        if (tb > T.beam) {
          const tc = (tb - T.beam) / 16;
          for (const [vx, vy, sp] of coins) {
            const x = walletX + vx * tc;
            const y = walletY + vy * tc + 0.045 * tc * tc;
            if (y > H) continue;
            const w = 12 * Math.abs(Math.cos(tc / 6 + sp));
            rect(x - w / 2 - 1, y - 7, w + 2, 14, "#b8860b");
            rect(x - w / 2, y - 6, w, 12, "#ffd24a");
          }
          const tr = tb - T.beam;
          const n = Math.round(r.res.amount * (1 - Math.pow(1 - Math.min(1, tr / 700), 3)));
          const ay = gy + 14 * px + 20 + lines.length * lineH + 150;
          rect(0, codeY - 20, W, ay - codeY + 70, "rgba(2,4,18,0.85)");
          text("+" + n.toLocaleString("en-US"), W / 2, ay - 50, 40, "#ffd24a", "center", 14);
          text("YOUCOG CLAIMED", W / 2, ay - 8, 16, "#fff", "center", 4);
          if (r.res.streak) text(`🔥 ${r.res.streak}-DAY STREAK`, W / 2, ay + 24, 15, "#ff9a3c", "center", 6);
          if (r.res.note) text(r.res.note, W / 2, ay + 50, 12, "#c9d6ff", "center");
          if (!closeAt) closeAt = now + T.beam + T.reveal;
        }
      }
      text("tap to skip", W / 2, H - 24, 11, "rgba(201,214,255,0.6)", "center");
      if (closeAt && now > closeAt) return close();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.t0, run?.reduced]);

  // Reduced motion: a static card, auto-closes after the result lands.
  useEffect(() => {
    if (!run?.reduced || !run.res) return;
    const id = window.setTimeout(close, 2600);
    return () => window.clearTimeout(id);
  }, [run?.reduced, run?.res]);

  if (!run) return null;
  return (
    <div
      onClick={close}
      data-testid="forge-claim"
      role="status"
      aria-live="polite"
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: run.reduced ? "rgba(2,4,18,0.92)" : "transparent", cursor: "pointer" }}
    >
      {run.reduced ? (
        <div style={{ position: "absolute", top: "40%", width: "100%", textAlign: "center", color: "#fff", fontFamily: "ui-monospace, monospace" }}>
          {!run.res ? "Sending your claim on Base…" : run.res.ok ? `+${run.res.amount.toLocaleString("en-US")} YOUCOG claimed${run.res.streak ? ` · ${run.res.streak}-day streak` : ""}` : "Claim didn't go through"}
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", imageRendering: "pixelated" }} />
      )}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        {run.res?.ok ? `${run.res.amount} YOUCOG claimed` : ""}
      </span>
    </div>
  );
}
