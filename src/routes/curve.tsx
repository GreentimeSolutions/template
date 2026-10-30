import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { connectedBaseAddress } from "@/lib/youcog/wallet";
import { fmtUnits, priceAt, WAD, type Step } from "@/lib/mintclub/curve";
import { buyOnCurve, quoteBuyOnChain, quoteSellOnChain, readBond, sellOnCurve, type BondState } from "@/lib/mintclub/bond";
import { CURVE_TOKEN, YCURV } from "@/constants/curve";

const TITLE = "Youcog Curve (YCURV) · Youcognito";

export const Route = createFileRoute("/curve")({
  head: () => ({ meta: [{ title: TITLE }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CurvePage,
});

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
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("1000");
  const [bond, setBond] = useState<BondState | null>(null);
  const [readErr, setReadErr] = useState(false);
  const [quote, setQuote] = useState<Quote>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tokenAddr = CURVE_TOKEN as Address;

  useEffect(() => {
    if (bond) return;
    let off = false;
    readBond(tokenAddr)
      .then((b) => !off && (setBond(b), setReadErr(false)))
      .catch(() => !off && setReadErr(true));
    return () => {
      off = true;
    };
  }, [bond, tokenAddr]);

  const symbol = bond?.symbol ?? YCURV.symbol;
  const name = bond?.name ?? YCURV.name;

  const amt = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e6)) * 10n ** 12n : 0n;
  }, [amount]);

  useEffect(() => {
    setQuote(null);
    if (!bond || amt === 0n) return;
    let off = false;
    setQuoting(true);
    const t = setTimeout(() => {
      (side === "buy" ? quoteBuyOnChain(tokenAddr, amt) : quoteSellOnChain(tokenAddr, amt))
        .then((q) => !off && setQuote(q))
        .catch(() => !off && setQuote(null))
        .finally(() => !off && setQuoting(false));
    }, 300);
    return () => {
      off = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, amt, bond]);

  const canTrade = inMiniApp && !!bond;
  const lockedReason = !inMiniApp ? "Open this in the Farcaster app to buy or sell with your wallet." : null;

  async function onTrade() {
    if (!canTrade || !bond || amt === 0n || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      const p = await sdk.wallet.getEthereumProvider();
      const me = (await connectedBaseAddress()) as Address | null;
      if (!p || !me) throw new Error("No wallet");
      const hash = side === "buy" ? await buyOnCurve(p, me, tokenAddr, bond.reserveToken, amt) : await sellOnCurve(p, me, tokenAddr, amt);
      setMsg(`Done. https://basescan.org/tx/${hash}`);
      setBond(null);
    } catch (e) {
      setMsg(e instanceof Error && /reject|denied/i.test(e.message) ? "Cancelled in your wallet." : "That didn't go through. Nothing was charged unless your wallet shows a confirmed transaction.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (on: boolean) => `press flex-1 rounded-seal px-3 py-2 text-sm ${on ? "bg-violet-500/30 text-ink border border-violet-400/60" : "border border-line text-mist"}`;
  const roundTripPct = bond ? (bond.mintRoyaltyBps + bond.burnRoyaltyBps) / 100 : 0;
  const reserveSymbol = bond?.reserveSymbol ?? "YOUCOG";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-canvas px-4 py-5 text-ink" data-testid="curve-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl" data-testid="curve-title">👻 {name} <span className="text-mist">({symbol})</span></p>
          <p className="text-sm text-mist">Mint Club bonding curve on Base · paid in {reserveSymbol}</p>
        </div>
        <Link to="/" className="press shrink-0 rounded-seal border border-line px-3 py-2 text-sm">App</Link>
      </header>

      <p className="rounded-seal border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" data-testid="preview-banner">
        <b>Live on Base.</b> {symbol} is a real token; buying spends real {reserveSymbol} from your wallet and your wallet asks you to
        confirm every step. This page is a Farcaster preview build.
      </p>
      {checked && !inMiniApp ? (
        <p className="text-xs text-faint">You're in a browser. This page is meant for the Farcaster app; here it shows live quotes only.</p>
      ) : null}

      <p className="text-xs text-mist">
        Token:{" "}
        <a className="underline" href={`https://basescan.org/token/${tokenAddr}`} target="_blank" rel="noreferrer">
          {tokenAddr.slice(0, 6)}…{tokenAddr.slice(-4)}
        </a>{" "}
        ·{" "}
        <a className="underline" href={`https://mint.club/token/base/${symbol}`} target="_blank" rel="noreferrer">
          mint.club
        </a>
      </p>

      {readErr ? <p className="text-sm text-danger">Couldn't read the curve from Base right now.</p> : null}
      {!bond ? (
        !readErr ? <p className="text-sm text-mist">Reading the curve from Base…</p> : null
      ) : (
        <>
          <CurveChart steps={bond.steps} supply={bond.supply} reserveSymbol={reserveSymbol} />
          <div className="grid grid-cols-2 gap-2">
            <Stat label={`Price now (${reserveSymbol})`} value={fmtUnits(priceAt(bond.steps, bond.supply))} />
            <Stat label="Supply" value={`${fmtUnits(bond.supply, 18, 0)} / ${fmtUnits(bond.steps[bond.steps.length - 1].rangeTo, 18, 0)}`} />
            <Stat label="Buy royalty" value={`${bond.mintRoyaltyBps / 100}%`} />
            <Stat label="Sell royalty" value={`${bond.burnRoyaltyBps / 100}%`} />
          </div>
          <p className="text-xs text-faint">
            {bond.steps.length} price steps · {fmtUnits(bond.reserveBalance)} {reserveSymbol} held by the curve · read live from Base
          </p>

          <section className="rounded-panel border border-line bg-panel p-4">
            <div className="flex gap-2">
              <button type="button" className={tab(side === "buy")} onClick={() => setSide("buy")} data-testid="side-buy">Buy</button>
              <button type="button" className={tab(side === "sell")} onClick={() => setSide("sell")} data-testid="side-sell">Sell</button>
            </div>
            <label className="mt-3 block text-xs text-faint" htmlFor="curve-amt">
              Amount of {symbol}
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
                    <p>You'd pay <b>{fmtUnits(quote.total)} {reserveSymbol}</b></p>
                    <p className="text-xs text-faint">includes {fmtUnits(quote.royalty)} {reserveSymbol} royalty</p>
                  </>
                ) : (
                  <>
                    <p>You'd get back <b>{fmtUnits(quote.total)} {reserveSymbol}</b></p>
                    <p className="text-xs text-faint">after {fmtUnits(quote.royalty)} {reserveSymbol} royalty</p>
                  </>
                )
              ) : (
                <p className="text-faint">
                  {amt === 0n
                    ? "Enter an amount."
                    : quoting
                      ? "Getting a quote from Base…"
                      : side === "sell" && amt > bond.supply
                        ? `Can't sell more ${symbol} than exists (${fmtUnits(bond.supply, 18, 0)} so far).`
                        : "No quote for that amount (over max supply)."}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!canTrade || busy || !quote}
              onClick={() => void onTrade()}
              className="press mt-3 w-full rounded-seal bg-violet-500 px-4 py-3 font-display text-lg text-white disabled:opacity-40"
              data-testid="trade-btn"
            >
              {busy ? "Confirm in your wallet…" : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
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
          <li>Buying and selling each take a royalty{bond ? ` (${roundTripPct}% for a round trip)` : ""}, so selling right after buying returns less.</li>
          <li>Prices are set in {reserveSymbol}, so the dollar value also moves with that token's own price.</li>
          <li>Smart contracts can have bugs. Mint Club V2 was audited (CertiK, 2024); that doesn't remove the risk.</li>
          <li>This is an experiment, not an investment. Nothing here promises a return. Only use amounts you're fine losing.</li>
        </ul>
      </section>

      <section className="rounded-panel border border-line bg-panel/60 p-4 text-sm text-mist">
        <p className="font-display text-base text-ink">How the curve works</p>
        <p className="mt-1">
          Buying mints new tokens and puts your {reserveSymbol} into the curve's pool. Selling burns tokens and pays out
          of that pool at the curve's price for that supply. No one can pull the pool out; it only shrinks when people sell. Built on
          Mint Club V2 (mint.club).
        </p>
      </section>
    </main>
  );
}
