import { useEffect, useState } from "react";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { shareToFarcaster, streakText } from "@/lib/youcog/share";

type Claimer = {
  fid: number | null; username: string | null; pfp: string | null; address: string;
  total: number; claims: number; longestStreak: number; currentStreak: number;
};
type Tipper = { fid: number | null; username: string | null; pfp: string | null; address: string; eth: number; usdc: number; tips: number };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const label = (r: { username: string | null; fid: number | null; address: string }) =>
  r.username ? `@${r.username}` : r.fid ? `FID ${r.fid}` : short(r.address);

function Avatar({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="h-6 w-6 shrink-0 rounded-full bg-inset" aria-hidden="true" />
  );
}

export function Leaderboard() {
  const [data, setData] = useState<{ claimers: Claimer[]; tippers: Tipper[] } | null>(null);
  const [tab, setTab] = useState<"claimers" | "tippers">("claimers");
  const miniApp = useMiniApp();

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ claimers: [], tippers: [] }));
  }, []);

  const me = data?.claimers.find((c) => miniApp.user?.fid && c.fid === miniApp.user.fid);
  const myStreak = me?.currentStreak ?? 0;

  return (
    <section id="leaderboard" className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg text-ink">Leaderboard</p>
        <div className="flex gap-1 text-xs" role="tablist">
          {(["claimers", "tippers"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`press rounded-seal border px-2 py-1 ${tab === t ? "border-accent bg-accent text-accent-fg" : "border-line text-ink"}`}
            >
              {t === "claimers" ? "Claimers" : "Tippers"}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <p className="mt-3 text-sm text-mist">Loading…</p>
      ) : tab === "claimers" ? (
        data.claimers.length ? (
          <ol className="mt-3 flex flex-col gap-2">
            {data.claimers.slice(0, 10).map((c, i) => (
              <li key={`${c.fid ?? c.address}`} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-right text-mist">{i + 1}</span>
                <Avatar src={c.pfp} />
                <span className="min-w-0 flex-1 truncate text-ink">{label(c)}</span>
                <span className="shrink-0 text-xs text-mist" title="current / longest streak">
                  🔥{c.currentStreak} · best {c.longestStreak}
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-xs text-ink">{c.total.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-mist">No claims yet. Be the first.</p>
        )
      ) : data.tippers.length ? (
        <ol className="mt-3 flex flex-col gap-2">
          {data.tippers.map((t, i) => (
            <li key={`${t.fid ?? t.address}`} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right text-mist">{i + 1}</span>
              <Avatar src={t.pfp} />
              <span className="min-w-0 flex-1 truncate text-ink">{label(t)}</span>
              <span className="shrink-0 font-mono text-xs text-ink">
                {[t.eth ? `${t.eth} ETH` : "", t.usdc ? `${t.usdc} USDC` : ""].filter(Boolean).join(" + ")}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-mist">No tips yet. Tips through Support Youcog show up here.</p>
      )}
      <button
        type="button"
        onClick={() => void shareToFarcaster(streakText(myStreak), miniApp.inMiniApp)}
        className="press mt-4 inline-flex h-10 w-full items-center justify-center rounded-seal border border-line text-sm font-medium text-ink"
      >
        Share to Farcaster
      </button>
      <a href="/stats" className="mt-3 block text-center text-xs text-mist underline underline-offset-4">
        View live faucet stats →
      </a>
    </section>
  );
}
