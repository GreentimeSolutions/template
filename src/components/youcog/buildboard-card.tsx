import { useEffect, useState } from "react";

const CODE = "bc_q72p8qc9";
const API = `https://builder-circle.xyz/api/widget/${CODE}?window=7d`;
const PAGE = `https://builder-circle.xyz/share/app/${CODE}`;

type BuildBoard = {
  rank: number | null;
  total_codes: number | null;
  wtu: number | null;
  tx_count: number | null;
  window_complete: boolean;
};

const fmt = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString() : "–");

/** Live BuildBoard (Builder Circle) rank for our Base Builder Code, fetched client-side (the API allows CORS GET). */
export function BuildBoardCard() {
  const [d, setD] = useState<BuildBoard | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(API, { headers: { accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: BuildBoard) => {
          if (!alive) return;
          setD(j);
          setErr(false);
        })
        .catch(() => alive && setErr(true));
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <section
      className="relative overflow-hidden rounded-panel border border-line-strong bg-panel p-4"
      style={{ boxShadow: "0 0 28px rgb(168 85 247 / 0.28), inset 0 0 40px rgb(124 58 237 / 0.12)" }}
      aria-labelledby="buildboard-title"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full"
        style={{ background: "radial-gradient(circle, rgb(192 132 252 / 0.35), transparent 70%)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p id="buildboard-title" className="text-xs uppercase tracking-wide text-faint">BuildBoard · last 7 days</p>
          <p className="mt-1 font-display text-3xl text-ink" aria-live="polite">
            {d ? (d.rank ? `#${fmt(d.rank)}` : "Unranked") : err ? "–" : "…"}
            {d?.rank && d.total_codes ? <span className="ml-2 text-base text-mist">of {fmt(d.total_codes)}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-mist">Base apps ranked by builder code activity</p>
        </div>
        <span className="shrink-0 rounded-seal border border-line px-2 py-1 font-mono text-[11px] text-mist">{CODE}</span>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-panel border border-line bg-inset/70 p-3">
          <p className="text-xs uppercase tracking-wide text-faint">Weekly users</p>
          <p className="mt-1 font-display text-2xl text-ink">{d ? fmt(d.wtu) : "…"}</p>
        </div>
        <div className="rounded-panel border border-line bg-inset/70 p-3">
          <p className="text-xs uppercase tracking-wide text-faint">Base txs</p>
          <p className="mt-1 font-display text-2xl text-ink">{d ? fmt(d.tx_count) : "…"}</p>
        </div>
      </div>

      {d && !d.window_complete ? (
        <p className="relative mt-3 rounded-panel border border-line bg-inset/70 px-3 py-2 text-xs text-mist">
          Partial window: BuildBoard has not indexed the full 7 days yet, so these numbers may be low.
        </p>
      ) : null}
      {err && !d ? <p className="relative mt-3 text-xs text-mist">BuildBoard stats are unavailable right now.</p> : null}

      <p className="relative mt-3 text-xs text-faint">
        Counts wallets that send txs with our builder code. Faucet payouts all come from one server wallet, so they count as one user.
      </p>
      <a
        className="press relative mt-3 inline-block rounded-seal border border-line-strong px-3 py-2 text-sm text-ink"
        href={PAGE}
        target="_blank"
        rel="noreferrer"
      >
        View on BuildBoard ↗
      </a>
    </section>
  );
}
