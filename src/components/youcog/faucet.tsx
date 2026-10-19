import { BuyYoucogButton, CoinbaseWalletLink } from "@/components/youcog/buy-youcog";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { claimFaucet } from "@/lib/youcog/youcog.functions";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { shareToFarcaster, streakText } from "@/lib/youcog/share";
import { HauntedButtonFrame, celebrate } from "@/components/youcog/halloween";
import { ListenBoost } from "@/components/youcog/listen-boost";
import { markListenUsed, setListenIdentity, useListen } from "@/lib/youcog/listen-client";
import { LISTEN_BONUS_AMOUNT } from "@/constants/listen";

async function connectedBaseAddress(): Promise<string | null> {
  const { sdk } = await import("@farcaster/miniapp-sdk");
  const provider = await sdk.wallet.getEthereumProvider();
  if (!provider) return null;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
  } catch {
    /* host may already be on Base or not support switching */
  }
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  return accounts?.[0] ?? null;
}

const AMOUNTS = [420, 1111, 6969] as const;
type Msg = { kind: "ok" | "err"; text: string; url?: string; amount?: number; streak?: number };
type Streak = { streak: number; claimedToday: boolean; nextStreak: number; nextMultiplier: number };

export function Faucet() {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState<(typeof AMOUNTS)[number]>(420);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const miniApp = useMiniApp();
  const fc = miniApp.inMiniApp;
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [useOther, setUseOther] = useState(false);

  useEffect(() => {
    if (!fc) return;
    connectedBaseAddress()
      .then((a) => setWalletAddr(a))
      .catch(() => setWalletAddr(null));
  }, [fc]);

  const recipient = fc && walletAddr && !useOther ? walletAddr : address.trim();

  // Tell the listen-boost flow who is claiming (same identity the faucet keys on).
  const listen = useListen();
  const sectionRef = useRef<HTMLElement>(null);
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient);
  useEffect(() => {
    // The app renders a desktop and a mobile copy of this card; only the visible one speaks.
    if (!sectionRef.current?.getClientRects().length) return;
    setListenIdentity(fc ? { fc: true } : validRecipient ? { fc: false, address: recipient } : null);
  }, [fc, recipient, validRecipient]);
  const boosted = listen.phase === "unlocked";

  // Cosmetic only: ghosts and bats after a real successful claim.
  useEffect(() => {
    if (msg?.kind === "ok") celebrate();
  }, [msg]);
  const [streak, setStreak] = useState<Streak | null>(null);

  async function loadStreak() {
    try {
      if (fc) {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const r = await sdk.quickAuth.fetch(`${window.location.origin}/api/streak`);
        setStreak(await r.json());
      } else if (/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
        const r = await fetch(`/api/streak?address=${recipient}`);
        setStreak(await r.json());
      } else setStreak(null);
    } catch {
      setStreak(null);
    }
  }
  useEffect(() => {
    void loadStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc, recipient]);


  async function onClaim(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let res:
        | { ok: true; amount: number; url: string; streak?: number; multiplier?: number; baseAmount?: number; listenBonus?: boolean }
        | { ok: false; reason: string };
      if (fc) {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const r = await sdk.quickAuth.fetch(
          `${window.location.origin}/api/fid-claim`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: recipient, amount }),
          },
        );
        res = await r.json();
      } else {
        res = await claimFaucet({
          data: { address: recipient, amount, website },
        });
      }
      if (res.ok) {
        if (res.listenBonus) markListenUsed();
        setMsg({
          kind: "ok",
          text: `Sent ${res.amount.toLocaleString()} YOUCOG to your address.${res.listenBonus ? " Listen boost applied." : ""}${
            res.streak ? ` ${res.streak}-day streak${res.multiplier && res.multiplier > 1 ? ` (${res.multiplier}x bonus)` : ""}.` : ""
          }`,
          url: res.url,
          amount: res.amount,
          streak: res.streak,
        });
        void loadStreak();
      } else {
        setMsg({ kind: "err", text: res.reason });
      }
    } catch (error) {
      const text =
        error instanceof Error ? error.message.replace(/^Error:\s*/, "") : "";
      setMsg({
        kind: "err",
        text: text || "The faucet couldn't respond. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={sectionRef} className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-spooky text-xl tracking-wide text-ink">Daily YOUCOG faucet</p>
        <BuyYoucogButton label="Buy YOUCOG" className="inline-flex h-8 items-center justify-center rounded-seal border border-line px-3 text-xs font-medium text-ink" />
      </div>
      <div className="mt-1 flex justify-end">
        <CoinbaseWalletLink />
      </div>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        {fc
          ? `Claim YOUCOG on Base once per day${miniApp.user?.username ? ` as @${miniApp.user.username}` : ""}. One claim per Farcaster account.`
          : "Claim YOUCOG on Base once per day. One claim per address and per connection."}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-mist">
        Streak bonus: claim on consecutive UTC days for 1.25x from day 3 and 1.5x from day 7. Missing a day resets.
      </p>
      {streak && (streak.streak > 0 || streak.nextMultiplier > 1) ? (
        <p data-testid="streak" className="mt-2 text-sm text-ink">
          🔥 {streak.streak}-day streak
          {streak.claimedToday
            ? " · claimed today"
            : streak.nextMultiplier > 1
              ? ` · next claim ${streak.nextMultiplier}x`
              : ""}
        </p>
      ) : null}
      <form className="mt-4 flex flex-col gap-3" onSubmit={onClaim}>
        {fc && walletAddr ? (
          <div className="flex flex-col gap-1 text-sm text-mist">
            <span>
              Sending to{" "}
              {useOther ? (
                "another address"
              ) : (
                <span className="font-mono text-ink">
                  {walletAddr.slice(0, 6)}…{walletAddr.slice(-4)}
                </span>
              )}
            </span>
            <button
              type="button"
              className="self-start underline underline-offset-4"
              onClick={() => setUseOther(!useOther)}
            >
              {useOther
                ? "Use my connected wallet"
                : "Paste a different address"}
            </button>
          </div>
        ) : null}
        {!fc || !walletAddr || useOther ? (
          <>
            <label
              htmlFor="faucet-address"
              className="text-sm font-medium text-ink"
            >
              Your Base address
            </label>
            <input
              id="faucet-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              className="h-11 min-w-0 rounded-seal border border-line bg-inset px-3 font-mono text-base text-ink placeholder:text-faint"
            />
          </>
        ) : null}
        <input
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <ListenBoost ready={fc || validRecipient} />
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Amount"
        >
          {AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={amount === value}
              onClick={() => setAmount(value)}
              className={`press h-11 rounded-seal border text-sm font-medium ${
                amount === value
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line text-ink"
              }`}
            >
              {value.toLocaleString()}
            </button>
          ))}
        </div>
        <HauntedButtonFrame>
        <button
          type="submit"
          disabled={busy || !recipient}
          className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {busy
            ? "Sending…"
            : boosted
              ? `Claim ${LISTEN_BONUS_AMOUNT.toLocaleString()} YOUCOG (boosted)`
              : `Claim ${Math.round(amount * (streak && !streak.claimedToday ? streak.nextMultiplier : 1)).toLocaleString()} YOUCOG`}
        </button>
        </HauntedButtonFrame>
      </form>
      {msg ? (
        <p
          role="status"
          className={`mt-3 text-sm leading-relaxed ${msg.kind === "ok" ? "text-ink" : "text-danger"}`}
        >
          {msg.text}{" "}
          {msg.url ? (
            <a
              href={msg.url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-line-strong underline-offset-4"
            >
              View on Basescan
            </a>
          ) : null}
          {msg.kind === "ok" && msg.amount ? (
            <button
              type="button"
              onClick={() => void shareToFarcaster(streakText(msg.streak ?? 1), fc)}
              className="press ml-1 underline underline-offset-4"
            >
              Share to Farcaster
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
