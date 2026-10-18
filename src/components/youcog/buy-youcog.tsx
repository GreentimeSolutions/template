import { useState } from "react";
import { useMiniApp } from "@/lib/youcog/use-miniapp";

export const YOUCOG = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";
/** Bankr's own trade page for YOUCOG; routes the Bankr/Doppler YOUCOG/WETH pool. */
export const BUY_WEB_URL = `https://bankr.bot/terminal/trade?out=${YOUCOG.toLowerCase()}&chain=base`;
const TARGET = 10_000_000;
const BUFFER = 1.15;
const FALLBACK_USD = 1.1;
const FALLBACK_ETH_USD = 2500;

/** Wei of ETH needed for ~10M YOUCOG plus a buffer, from GeckoTerminal; falls back to ~$1.10 of ETH. */
async function sellAmountWei(): Promise<string> {
  let usd = FALLBACK_USD;
  let ethUsd = FALLBACK_ETH_USD;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${YOUCOG.toLowerCase()},0x4200000000000000000000000000000000000006`,
      { signal: ctl.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(t);
    const j = (await r.json()) as { data?: { attributes?: { token_prices?: Record<string, string> } } };
    const p = j.data?.attributes?.token_prices ?? {};
    const yc = Number(p[YOUCOG.toLowerCase()]);
    const eth = Number(p["0x4200000000000000000000000000000000000006"]);
    if (eth > 0) ethUsd = eth;
    if (yc > 0) usd = yc * TARGET * BUFFER;
  } catch {
    /* fallback */
  }
  usd = Math.min(Math.max(usd, 0.25), 25);
  const wei = BigInt(Math.round((usd / ethUsd) * 1e9)) * 1_000_000_000n;
  return wei.toString();
}

export function BuyYoucogButton({ label = "Get 10M YOUCOG (about $1)", className = "" }: { label?: string; className?: string }) {
  const { inMiniApp } = useMiniApp();
  const [busy, setBusy] = useState(false);

  async function onMiniAppBuy() {
    setBusy(true);
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      const sellAmount = await sellAmountWei();
      const res = await sdk.actions.swapToken({ sellToken: "eip155:8453/native", buyToken: `eip155:8453/erc20:${YOUCOG}`, sellAmount });
      if (!res.success && res.reason !== "rejected_by_user") await sdk.actions.openUrl(BUY_WEB_URL);
    } catch {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        await sdk.actions.openUrl(BUY_WEB_URL);
      } catch {
        window.open(BUY_WEB_URL, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusy(false);
    }
  }

  if (inMiniApp) {
    return (
      <button type="button" data-testid="buy-youcog" disabled={busy} onClick={() => void onMiniAppBuy()} className={`press disabled:opacity-60 ${className}`}>
        {busy ? "Opening swap…" : label}
      </button>
    );
  }
  return (
    <a data-testid="buy-youcog" href={BUY_WEB_URL} target="_blank" rel="noopener noreferrer" className={`press ${className}`}>
      {label}
    </a>
  );
}

export const COINBASE_WALLET_INVITE = "https://wallet.coinbase.com/invite/_base/6GYZL0C9";

export function CoinbaseWalletLink({ className = "" }: { className?: string }) {
  const { inMiniApp } = useMiniApp();
  return (
    <a
      data-testid="coinbase-wallet-link"
      href={COINBASE_WALLET_INVITE}
      target="_blank"
      rel="noopener noreferrer"
      onClick={async (e) => {
        if (!inMiniApp) return;
        e.preventDefault();
        try {
          const { sdk } = await import("@farcaster/miniapp-sdk");
          await sdk.actions.openUrl(COINBASE_WALLET_INVITE);
        } catch {
          window.open(COINBASE_WALLET_INVITE, "_blank", "noopener,noreferrer");
        }
      }}
      className={`text-xs text-mist underline decoration-line underline-offset-2 hover:text-ink ${className}`}
    >
      New to crypto? Get Coinbase Wallet
    </a>
  );
}
