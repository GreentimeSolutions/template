import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { APP_URL } from "@/lib/youcog/miniapp";

type Stats = {
  updatedAt: string;
  claims: { total: number; uniqueClaimers: number; uniqueWallets: number; uniqueFids: number; distributed: number; last24h: number; last7d: number };
  streaks: { active: number; longest: number };
  tips: { count: number; eth: number; usdc: number };
  builderCode: { code: string; attributedTxs: number };
  faucet: { address: string; eth?: string; youcog?: string };
  token: string;
  daily: { day: string; claims: number; tokens: number }[];
};

const TITLE = "Youcognito stats";
const DESC = "Live YOUCOG faucet stats on Base: claims, streaks, tips and faucet balance.";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:image", content: `${APP_URL}/stats-og.png` },
      { property: "og:url", content: `${APP_URL}/stats` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${APP_URL}/stats-og.png` },
    ],
  }),
  component: StatsPage,
});

const fmt = (n: number, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d });

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-panel border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      {sub ? <p className="mt-1 text-xs text-mist">{sub}</p> : null}
    </div>
  );
}

function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const load = () =>
      fetch("/api/stats")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => { setS(d); setErr(false); })
        .catch(() => setErr(true));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const max = Math.max(1, ...(s?.daily.map((d) => d.claims) ?? [1]));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-canvas px-4 py-6 text-ink sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl">👻 Youcognito stats</p>
          <p className="text-sm text-mist">Live from the YOUCOG faucet on Base{s ? ` · updated ${new Date(s.updatedAt).toLocaleTimeString()}` : ""}</p>
        </div>
        <Link to="/" className="press shrink-0 rounded-seal border border-line px-3 py-2 text-sm">Open app</Link>
      </header>

      {err && !s ? <p className="text-sm text-danger">Stats are unavailable right now.</p> : null}
      {!s ? (
        !err ? <p className="text-sm text-mist">Loading…</p> : null
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card label="Total claims" value={fmt(s.claims.total)} sub={`${fmt(s.claims.last24h)} in 24h · ${fmt(s.claims.last7d)} in 7d`} />
            <Card label="Unique claimers" value={fmt(s.claims.uniqueClaimers)} sub={`${fmt(s.claims.uniqueWallets)} wallets · ${fmt(s.claims.uniqueFids)} FIDs`} />
            <Card label="YOUCOG given" value={fmt(s.claims.distributed)} />
            <Card label="Active streaks" value={fmt(s.streaks.active)} sub={`Longest ${s.streaks.longest} day${s.streaks.longest === 1 ? "" : "s"}`} />
            <Card label="Tips" value={fmt(s.tips.count)} sub={`${fmt(s.tips.eth, 6)} ETH · ${fmt(s.tips.usdc, 2)} USDC`} />
            <Card label="Builder Code txs" value={fmt(s.builderCode.attributedTxs)} sub={s.builderCode.code} />
          </div>

          <section className="rounded-panel border border-line bg-panel p-4">
            <p className="text-sm font-medium">Daily claims · last 30 days</p>
            <div className="mt-3 flex h-32 items-end gap-[3px]" role="img" aria-label="Daily claims chart">
              {s.daily.map((d) => (
                <div key={d.day} className="flex-1" title={`${d.day}: ${d.claims} claims, ${fmt(d.tokens)} YOUCOG`}>
                  <div
                    className={`w-full rounded-t-sm ${d.claims ? "bg-accent" : "bg-inset"}`}
                    style={{ height: `${Math.max(3, (d.claims / max) * 128)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-faint">
              <span>{s.daily[0]?.day.slice(5)}</span>
              <span>{s.daily.at(-1)?.day.slice(5)}</span>
            </div>
          </section>

          <section className="rounded-panel border border-line bg-panel p-4 text-sm">
            <p className="font-medium">Faucet wallet</p>
            <p className="mt-2 text-mist">
              {s.faucet.youcog ? `${fmt(Number(s.faucet.youcog))} YOUCOG` : "Balance unavailable"}
              {s.faucet.eth ? ` · ${Number(s.faucet.eth).toFixed(6)} ETH for gas` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <a className="underline underline-offset-4" target="_blank" rel="noreferrer" href={`https://basescan.org/address/${s.faucet.address}`}>
                Faucet wallet on Basescan
              </a>
              <a className="underline underline-offset-4" target="_blank" rel="noreferrer" href={`https://basescan.org/token/${s.token}`}>
                YOUCOG token
              </a>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
