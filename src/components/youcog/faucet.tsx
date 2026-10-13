import { useEffect, useState, type FormEvent } from "react";
import { claimFaucet } from "@/lib/youcog/youcog.functions";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { APP_URL } from "@/lib/youcog/miniapp";

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
type Msg = { kind: "ok" | "err"; text: string; url?: string; amount?: number };

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

  async function share(amountSent: number) {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    await sdk.actions
      .composeCast({
        text: `I just claimed ${amountSent.toLocaleString()} free $YOUCOG on Base with Youcognito. Claim yours:`,
        embeds: [APP_URL],
      })
      .catch(() => undefined);
  }

  async function onClaim(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let res:
        | { ok: true; amount: number; url: string }
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
        setMsg({
          kind: "ok",
          text: `Sent ${res.amount.toLocaleString()} YOUCOG to your address.`,
          url: res.url,
          amount: res.amount,
        });
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
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <p className="font-display text-lg text-ink">YOUCOG faucet</p>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        {fc
          ? `Claim free YOUCOG on Base once per day${miniApp.user?.username ? ` as @${miniApp.user.username}` : ""}. One claim per Farcaster account.`
          : "Claim free YOUCOG on Base once per day. One claim per address and per connection."}
      </p>
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
        <button
          type="submit"
          disabled={busy || !recipient}
          className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? "Sending…" : `Claim ${amount.toLocaleString()} YOUCOG`}
        </button>
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
          {fc && msg.kind === "ok" && msg.amount ? (
            <button
              type="button"
              onClick={() => void share(msg.amount!)}
              className="press ml-1 underline underline-offset-4"
            >
              Share
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
