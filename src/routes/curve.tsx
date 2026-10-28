import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { connectedBaseAddress } from "@/lib/youcog/wallet";
import { buildSteps, fmtUnits, priceAt, quoteBurn, quoteMint, WAD, type Step } from "@/lib/mintclub/curve";
import { buyOnCurve, quoteBuyOnChain, quoteSellOnChain, readBond, sellOnCurve, type BondState } from "@/lib/mintclub/bond";
import { CURVE_TOKEN, DEMO_TOKEN, PROPOSED } from "@/constants/curve";

const TITLE = "Curve (preview) · Youcognito";

export const Route = createFileRoute("/curve")({
  head: () => ({ meta: [{ title: TITLE }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CurvePage,
});

type Mode = "proposed" | "demo";
type Side = "buy" | "sell";
type Quote = { total: bigint; royalty: bigint } | null;

/** Step chart of price (reserve per token) against supply, with a marker at the current supply. */
function CurveChart({ steps, supply, reserveSymbol }: { steps: Step[]; supply: bigint; reserveSymbol: string }) {
  const W = 320;
  const H = 150;
  const max = Number(steps[steps.length - 1].rangeTo / WAD);
  const top = Number(steps[steps.length - 1].price) / 1e18;
  const x = (s: number) => (s / max) * W;
  const y = (p: number) => H - (p / top) * (H - 8);
  let prev = 0;
  let filled = "";
  let line = `M0 ${H}`;
  const sNow = Number(supply / WAD);
  for (const st of steps) {
    const to = Number(st.rangeTo / WAD);
    const p = Number(st.price) / 1e18;
    line += ` L${x(prev)} ${y(p)} L${x(to)} ${y(p)}`;
    if (prev < sNow) {
      const end = Math.min(to, sNow);
      filled += `M${x(prev)} ${H} L${x(prev)} ${y(p)} L${x(end)} ${y(p)} L${x(end)} ${H} Z `;
    }
    prev = to;
  }
  return (
    <figure className="rounded-seal border border-line bg-inset p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="Bonding curve price by supply">
        <path d={filled} fill="rgba(167,139,250,0.35)" />
        <path d={line} fill="none" stroke="#a78bfa" strokeWidth={2} />
        <line x1={x(sNow)} x2={x(sNow)} y1={0} y2={H} stroke="#86efac" strokeDasharray="4 3" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-faint">
        <span>Supply 0</span>
        <span className="text-emerald-300">▲ now</span>
        <span>{max.toLocaleString()} max</span>
      </figcaption>
      <p className="mt-1 text-xs text-mist">
        Shaded area = {reserveSymbol} held by the curve. Price climbs in steps as tokens are bought and steps back down as they're sold.
      </p>
    </figure>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-seal border border-line bg-inset p-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg text-ink">{value}</p>
    </div>
  );
}

function CurvePage() {
  const { inMiniApp, checked } = useMiniApp();
  const live = Boolean(CURVE_TOKEN);
  const [mode, setMode] = useState<Mode>(live ? "demo" : "proposed");
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("1000");
  const [demo, setDemo] = useState<BondState | null>(null);
  const [demoErr, setDemoErr] = useState(false);
  const [quote, setQuote] = useState<Quote>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tokenAddr = (live ? CURVE_TOKEN : DEMO_TOKEN.address) as Address;
  const proposedSteps = useMemo(() => buildSteps(PROPOSED.design), []);
  const proposedSupply = BigInt(PROPOSED.exampleSupply) * WAD;

  useEffect(() => {
    if (mode !== "demo" || demo) return;
    readBond(tokenAddr).then(setDemo).catch(() => setDemoErr(true));
  }, [mode, demo, tokenAddr]);

  const view =
    mode === "proposed"
      ? { symbol: PROPOSED.symbol, steps: proposedSteps, supply: proposedSupply, reserveSymbol: PROPOSED.reserveSymbol, mintBps: PROPOSED.royaltyBps, burnBps: PROPOSED.royaltyBps }
      : demo
        ? { symbol: live ? "your token" : DEMO_TOKEN.symbol, steps: demo.steps, supply: demo.supply, reserveSymbol: demo.reserveSymbol, mintBps: demo.mintRoyaltyBps, burnBps: demo.burnRoyaltyBps }
        : null;

  const amt = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e6)) * 10n ** 12n : 0n;
  }, [amount]);

  useEffect(() => {
    setQuote(null);
    if (!view || amt === 0n) return;
    if (mode === "proposed") {
      setQuote(side === "buy" ? quoteMint(view.steps, view.supply, amt, view.mintBps) : quoteBurn(view.steps, view.supply, amt, view.burnBps));
      return;
    }
    let off = false;
    const t = setTimeout(() => {
      (side === "buy" ? quoteBuyOnChain(tokenAddr, amt) : quoteSellOnChain(tokenAddr, amt)).then((q) => !off && setQuote(q)).catch(() => !off && setQuote(null));
    }, 300);
    return () => {
      off = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, side, amt, demo]);

  const canTrade = live && inMiniApp && mode === "demo" && !!demo;
  const lockedReason = !live
    ? "Buying and selling switch on only after the token is created. This preview can't trade."
    : !inMiniApp
      ? "Open this in the Farcaster app to buy or sell."
      : null;

  async function onTrade() {
    if (!canTrade || !demo || amt === 0n || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      const p = await sdk.wallet.getEthereumProvider();
      const me = (await connectedBaseAddress()) as Address | null;
      if (!p || !me) throw new Error("No wallet");
      const hash = side === "buy" ? await buyOnCurve(p, me, tokenAddr, demo.reserveToken, amt) : await sellOnCurve(p, me, tokenAddr, amt);
      setMsg(`Done. https://basescan.org/tx/${hash}`);
      setDemo(null);
    } catch (e) {
      setMsg(e instanceof Error && /reject|denied/i.test(e.message) ? "Cancelled in your wallet." : "That didn't go through. Nothing was charged unless your wallet shows a confirmed transaction.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (on: boolean) => `press flex-1 rounded-seal px-3 py-2 text-sm ${on ? "bg-violet-500/30 text-ink border border-violet-400/60" : "border border-line text-mist"}`;
  const roundTripPct = view ? (view.mintBps + view.burnBps) / 100 : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-canvas px-4 py-5 text-ink" data-testid="curve-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl">👻 Youcog Curve</p>
          <p className="text-sm text-mist">Mint Club bonding curve on Base · Farcaster build</p>
        </div>
        <Link to="/" className="press shrink-0 rounded-seal border border-line px-3 py-2 text-sm">App</Link>
      </header>

      <p className="rounded-seal border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" data-testid="preview-banner">
        <b>Preview only.</b> No {PROPOSED.symbol} token exists yet and nothing here can move funds. Numbers on the "Proposed" tab are
        example data.
      </p>
      {checked && !inMiniApp ? (
        <p className="text-xs text-faint">You're in a browser. This page is meant for the Farcaster app; here it shows quotes only.</p>
      ) : null}

      <div className="flex gap-2" role="tablist">
        <button type="button" className={tab(mode === "proposed")} onClick={() => setMode("proposed")}>
          Proposed {PROPOSED.symbol}
        </button>
        <button type="button" className={tab(mode === "demo")} onClick={() => setMode("demo")}>
          {live ? "Live curve" : `Live demo (${DEMO_TOKEN.symbol})`}
        </button>
      </div>

      {mode === "demo" && !live ? (
        <p className="text-xs text-mist">
          Demo: real on-chain quotes from {DEMO_TOKEN.symbol}, an existing MT-backed Mint Club token on Base, just to show how live
          quotes work. It isn't ours and isn't a recommendation.
        </p>
      ) : null}
      {mode === "proposed" ? (
        <p className="text-xs text-mist">
          {PROPOSED.name} ({PROPOSED.symbol}): a new curve token paid for in YOUCOG. Example state: {PROPOSED.exampleSupply.toLocaleString()}{" "}
          already bought.
        </p>
      ) : null}

      {mode === "demo" && demoErr ? <p className="text-sm text-danger">Couldn't read the curve from Base right now.</p> : null}
      {!view ? (
        !demoErr ? <p className="text-sm text-mist">Reading the curve from Base…</p> : null
      ) : (
        <>
          <CurveChart steps={view.steps} supply={view.supply} reserveSymbol={view.reserveSymbol} />
          <div className="grid grid-cols-2 gap-2">
            <Stat label={`Price now (${view.reserveSymbol})`} value={fmtUnits(priceAt(view.steps, view.supply))} />
            <Stat label="Supply" value={`${fmtUnits(view.supply, 18, 0)} / ${fmtUnits(view.steps[view.steps.length - 1].rangeTo, 18, 0)}`} />
            <Stat label="Buy royalty" value={`${view.mintBps / 100}%`} />
            <Stat label="Sell royalty" value={`${view.burnBps / 100}%`} />
          </div>

          <section className="rounded-panel border border-line bg-panel p-4">
            <div className="flex gap-2">
              <button type="button" className={tab(side === "buy")} onClick={() => setSide("buy")} data-testid="side-buy">Buy</button>
              <button type="button" className={tab(side === "sell")} onClick={() => setSide("sell")} data-testid="side-sell">Sell</button>
            </div>
            <label className="mt-3 block text-xs text-faint" htmlFor="curve-amt">
              Amount of {view.symbol}
            </label>
            <input
              id="curve-amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="mt-1 w-full rounded-seal border border-line bg-inset px-3 py-2 text-lg text-ink"
            />
            <div className="mt-3 rounded-seal bg-inset p-3 text-sm" data-testid="quote">
              {quote ? (
                side === "buy" ? (
                  <>
                    <p>You'd pay <b>{fmtUnits(quote.total)} {view.reserveSymbol}</b></p>
                    <p className="text-xs text-faint">includes {fmtUnits(quote.royalty)} {view.reserveSymbol} royalty</p>
                  </>
                ) : (
                  <>
                    <p>You'd get back <b>{fmtUnits(quote.total)} {view.reserveSymbol}</b></p>
                    <p className="text-xs text-faint">after {fmtUnits(quote.royalty)} {view.reserveSymbol} royalty</p>
                  </>
                )
              ) : (
                <p className="text-faint">{amt === 0n ? "Enter an amount." : "No quote for that amount (over max supply or more than exists)."}</p>
              )}
            </div>
            <button
              type="button"
              disabled={!canTrade || busy || !quote}
              onClick={() => void onTrade()}
              className="press mt-3 w-full rounded-seal bg-violet-500 px-4 py-3 font-display text-lg text-white disabled:opacity-40"
              data-testid="trade-btn"
            >
              {busy ? "Confirm in your wallet…" : side === "buy" ? `Buy ${view.symbol}` : `Sell ${view.symbol}`}
            </button>
            {lockedReason ? <p className="mt-2 text-xs text-faint">{lockedReason}</p> : null}
            {msg ? <p className="mt-2 break-all text-xs text-mist">{msg}</p> : null}
          </section>
        </>
      )}

      <section className="rounded-panel border border-danger/60 bg-danger/10 p-4 text-sm" data-testid="risk-box">
        <p className="font-display text-base text-ink">Know the risks</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-mist">
          <li><b>The price can go down.</b> It falls along the curve every time someone sells, and you can get back less than you paid.</li>
          <li>Buying and selling each take a royalty{view ? ` (${roundTripPct}% for a round trip)` : ""}, so selling right after buying returns less.</li>
          <li>Prices are set in {view?.reserveSymbol ?? "YOUCOG"}, so the dollar value also moves with that token's own price.</li>
          <li>Smart contracts can have bugs. Mint Club V2 was audited (CertiK, 2024); that doesn't remove the risk.</li>
          <li>This is an experiment, not an investment. Nothing here promises a return. Only use amounts you're fine losing.</li>
        </ul>
      </section>

      <section className="rounded-panel border border-line bg-panel/60 p-4 text-sm text-mist">
        <p className="font-display text-base text-ink">How the curve works</p>
        <p className="mt-1">
          Buying mints new tokens and puts your {view?.reserveSymbol ?? "YOUCOG"} into the curve's pool. Selling burns tokens and pays out
          of that pool at the curve's price for that supply. No one can pull the pool out; it only shrinks when people sell. Built on
          Mint Club V2 (mint.club).
        </p>
      </section>
    </main>
  );
}
