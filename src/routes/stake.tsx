import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { connectedBaseAddress } from "@/lib/youcog/wallet";
import { claimFromPool, readPool, stakeInPool, unstakeFromPool, type PoolInfo } from "@/lib/mintclub/stake";
import { DEMO_POOL_ID, PROPOSED_STAKE, STAKE_POOL_ID } from "@/constants/stake";

export const Route = createFileRoute("/stake")({
  head: () => ({ meta: [{ title: "Stake (preview) · Youcognito" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: StakePage,
});

type Mode = "proposed" | "demo";
const DAY = 86_400;
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : d });
const units = (v: bigint, dec: number) => Number(v) / 10 ** dec;
const fmtDate = (s: number) => new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-seal border border-line bg-inset p-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg text-ink">{value}</p>
      {sub ? <p className="text-[11px] text-faint">{sub}</p> : null}
    </div>
  );
}

/** Bar showing how much of the fixed reward pool has been handed out vs what's left. */
function PoolBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-inset">
        <div className="h-full bg-violet-400" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-mist">{label}</p>
    </div>
  );
}

function StakePage() {
  const { inMiniApp, checked } = useMiniApp();
  const live = STAKE_POOL_ID !== "";
  const [mode, setMode] = useState<Mode>(live ? "demo" : "proposed");
  const [poolSize, setPoolSize] = useState(PROPOSED_STAKE.defaultPoolSize);
  const [amount, setAmount] = useState("1000000");
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const poolId = live ? BigInt(STAKE_POOL_ID) : DEMO_POOL_ID;

  useEffect(() => {
    readPool(poolId).then(setPool).catch(() => setErr(true));
  }, [poolId]);

  const amt = Math.max(0, Number(amount) || 0);
  const claimFeePct = pool ? pool.claimFeeBps / 100 : 4;

  // Proposed pool: pure example math (fixed pool / duration, split by share of total staked).
  const ex = useMemo(() => {
    const perDay = poolSize / PROPOSED_STAKE.durationDays;
    const total = PROPOSED_STAKE.exampleTotalStaked + amt;
    const share = total > 0 ? amt / total : 0;
    return { perDay, share, mine: perDay * share * (1 - claimFeePct / 100) };
  }, [poolSize, amt, claimFeePct]);

  // Live pool view.
  const lv = useMemo(() => {
    if (!pool) return null;
    const reward = units(pool.rewardAmount, pool.rewardDecimals);
    const perDay = reward / (pool.durationSec / DAY);
    const end = pool.startedAt ? pool.startedAt + pool.durationSec : 0;
    const staked = units(pool.totalStaked, pool.stakeDecimals);
    const share = staked + amt > 0 ? amt / (staked + amt) : 0;
    return {
      reward,
      perDay,
      end,
      staked,
      allocated: units(pool.allocated, pool.rewardDecimals),
      mine: perDay * share * (1 - pool.claimFeeBps / 10_000),
      share,
      over: pool.cancelledAt > 0 || (end > 0 && now >= end),
    };
  }, [pool, amt, now]);

  const canAct = live && inMiniApp && !!pool && !lv?.over;
  const lockedReason = !live
    ? "Staking switches on only after the YOUCOG pool is created. This preview can't stake."
    : !inMiniApp
      ? "Open this in the Farcaster app to stake."
      : null;

  async function act(kind: "stake" | "unstake" | "claim") {
    if (!canAct || !pool || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      const p = await sdk.wallet.getEthereumProvider();
      const me = (await connectedBaseAddress()) as Address | null;
      if (!p || !me) throw new Error("No wallet");
      const wei = BigInt(Math.round(amt * 1e6)) * 10n ** BigInt(pool.stakeDecimals - 6);
      const hash = kind === "stake" ? await stakeInPool(p, me, pool, wei) : kind === "unstake" ? await unstakeFromPool(p, me, pool, wei) : await claimFromPool(p, me, pool);
      setMsg(`Done. https://basescan.org/tx/${hash}`);
      readPool(poolId).then(setPool).catch(() => {});
    } catch (e) {
      setMsg(e instanceof Error && /reject|denied/i.test(e.message) ? "Cancelled in your wallet." : "That didn't go through. Check your wallet before trying again.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (on: boolean) => `press flex-1 rounded-seal px-3 py-2 text-sm ${on ? "bg-violet-500/30 text-ink border border-violet-400/60" : "border border-line text-mist"}`;
  const btn = "press flex-1 rounded-seal px-3 py-3 font-display text-base disabled:opacity-40";
  const stakeSym = mode === "proposed" ? PROPOSED_STAKE.stakeSymbol : (pool?.stakeSymbol ?? "");
  const rewardSym = mode === "proposed" ? PROPOSED_STAKE.rewardSymbol : (pool?.rewardSymbol ?? "");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-canvas px-4 py-5 text-ink" data-testid="stake-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl">👻 Youcog Stake</p>
          <p className="text-sm text-mist">Mint Club Staking on Base · Farcaster build</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/curve" className="press rounded-seal border border-line px-3 py-2 text-sm">Curve</Link>
          <Link to="/" className="press rounded-seal border border-line px-3 py-2 text-sm">App</Link>
        </div>
      </header>

      <p className="rounded-seal border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" data-testid="preview-banner">
        <b>Preview only.</b> No YOUCOG staking pool exists yet and nothing here can move funds. Numbers on the "Proposed" tab are example data.
      </p>
      {checked && !inMiniApp ? <p className="text-xs text-faint">You're in a browser. This page is meant for the Farcaster app; here it's view-only.</p> : null}

      <div className="flex gap-2" role="tablist">
        <button type="button" className={tab(mode === "proposed")} onClick={() => setMode("proposed")}>Proposed YOUCOG pool</button>
        <button type="button" className={tab(mode === "demo")} onClick={() => setMode("demo")} data-testid="tab-demo">
          {live ? "Live pool" : `Live demo (#${DEMO_POOL_ID})`}
        </button>
      </div>

      {mode === "proposed" ? (
        <section className="flex flex-col gap-3" data-testid="proposed">
          <p className="text-xs text-mist">
            Stake YOUCOG, earn YOUCOG from a fixed pool that Youcognito deposits up front. It pays out evenly over {PROPOSED_STAKE.durationDays} days,
            split by each staker's share. Example data: {fmt(PROPOSED_STAKE.exampleTotalStaked)} YOUCOG staked by others.
          </p>
          <div>
            <p className="text-xs text-faint">Reward pool size (example)</p>
            <div className="mt-1 flex gap-2">
              {PROPOSED_STAKE.poolSizes.map((s) => (
                <button key={s} type="button" className={tab(poolSize === s)} onClick={() => setPoolSize(s)}>{fmt(s / 1e6)}M</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Reward pool" value={`${fmt(poolSize)}`} sub="YOUCOG, fixed" />
            <Stat label="Paid out per day" value={fmt(ex.perDay)} sub="YOUCOG, shared by all stakers" />
            <Stat label="Length" value={`${PROPOSED_STAKE.durationDays} days`} sub="starts at the first stake" />
            <Stat label="Mint Club claim fee" value={`${claimFeePct}%`} sub="taken from rewards" />
          </div>
          <PoolBar used={0} total={poolSize} label="Example: 0% of the pool handed out so far. When it reaches 100%, rewards stop." />
        </section>
      ) : err ? (
        <p className="text-sm text-danger">Couldn't read the pool from Base right now.</p>
      ) : !pool || !lv ? (
        <p className="text-sm text-mist">Reading the pool from Base…</p>
      ) : (
        <section className="flex flex-col gap-3" data-testid="demo">
          {!live ? (
            <p className="text-xs text-mist">
              Demo: real on-chain data from Mint Club pool #{String(DEMO_POOL_ID)} ({pool.stakeSymbol} → {pool.rewardSymbol}), an existing pool on Base, just to
              show how a live pool reads. It isn't ours and isn't a recommendation.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Reward pool" value={fmt(lv.reward)} sub={`${pool.rewardSymbol}, fixed`} />
            <Stat label="Paid out per day" value={fmt(lv.perDay, 2)} sub={`${pool.rewardSymbol}, shared`} />
            <Stat label="Total staked" value={fmt(lv.staked, 2)} sub={`${pool.stakeSymbol} · ${pool.stakers} stakers`} />
            <Stat label="Ends" value={lv.end ? fmtDate(lv.end) : "Not started"} sub={lv.over ? "Finished or cancelled" : `${Math.round(pool.durationSec / DAY)}-day pool`} />
          </div>
          <PoolBar used={lv.allocated} total={lv.reward} label={`${fmt((lv.allocated / lv.reward) * 100, 1)}% of the pool handed out so far. When it's gone, rewards stop.`} />
          <p className="text-[11px] text-faint">Live from Base. Mint Club creation fee {Number(pool.creationFee) / 1e18} ETH, claim fee {claimFeePct}%.</p>
        </section>
      )}

      <section className="rounded-panel border border-line bg-panel p-4">
        <label className="block text-xs text-faint" htmlFor="stake-amt">Amount of {stakeSym || "tokens"}</label>
        <input
          id="stake-amt"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="mt-1 w-full rounded-seal border border-line bg-inset px-3 py-2 text-lg text-ink"
        />
        <div className="mt-3 rounded-seal bg-inset p-3 text-sm" data-testid="share">
          {mode === "proposed" ? (
            <>
              <p>Your share of the pool: <b>{fmt(ex.share * 100, 2)}%</b></p>
              <p>At that share, about <b>{fmt(ex.mine, 2)} {rewardSym}</b> a day after the claim fee</p>
            </>
          ) : lv ? (
            <>
              <p>Your share of the pool: <b>{fmt(lv.share * 100, 4)}%</b></p>
              <p>At that share, about <b>{fmt(lv.mine, 4)} {rewardSym}</b> a day after the claim fee{lv.over ? " (this pool has ended)" : ""}</p>
            </>
          ) : (
            <p className="text-faint">Waiting for pool data…</p>
          )}
          <p className="mt-1 text-[11px] text-faint">This shrinks as more people stake, stops when the pool is used up, and says nothing about what {rewardSym || "the token"} will be worth.</p>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!canAct || busy || amt <= 0} onClick={() => void act("stake")} className={`${btn} bg-violet-500 text-white`} data-testid="stake-btn">Stake</button>
          <button type="button" disabled={!canAct || busy || amt <= 0} onClick={() => void act("unstake")} className={`${btn} border border-line text-ink`} data-testid="unstake-btn">Unstake</button>
          <button type="button" disabled={!canAct || busy} onClick={() => void act("claim")} className={`${btn} border border-line text-ink`} data-testid="claim-btn">Claim</button>
        </div>
        {lockedReason ? <p className="mt-2 text-xs text-faint">{lockedReason}</p> : null}
        {msg ? <p className="mt-2 break-all text-xs text-mist">{msg}</p> : null}
      </section>

      <section className="rounded-panel border border-violet-400/50 bg-violet-500/10 p-4 text-sm text-mist" data-testid="save-bonus-note">
        <p className="font-display text-base text-ink">Staking vs. the +10% save bonus</p>
        <p className="mt-1">
          The save bonus only counts YOUCOG sitting in your own wallet. Staked YOUCOG is held by the pool, so it doesn't count. If you want a
          claim's save bonus, keep that claim in your wallet for its 7 days and stake only YOUCOG beyond it. You can't earn both on the same tokens.
        </p>
      </section>

      <section className="rounded-panel border border-danger/60 bg-danger/10 p-4 text-sm" data-testid="risk-box">
        <p className="font-display text-base text-ink">Know the risks</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-mist">
          <li><b>Rewards are fixed and run out.</b> The pool pays a set amount over a set time, shared by everyone. More stakers means less each, and when it's used up rewards stop.</li>
          <li>The pool creator can end the pool early. Rewards stop then; your staked tokens stay yours to unstake.</li>
          <li><b>While staked, your tokens aren't in your wallet.</b> You have to unstake before you can sell or move them, and that takes a transaction.</li>
          <li>Rewards are paid in YOUCOG, whose price can go down. Mint Club keeps {claimFeePct}% of each reward claim.</li>
          <li>Smart contracts can have bugs. Mint Club Staking was reviewed by CertiK (Aug 2025, after a reward-rounding issue was found and fixed); that doesn't remove the risk.</li>
          <li>This is an experiment, not an investment. Nothing here promises a return.</li>
        </ul>
      </section>
    </main>
  );
}
