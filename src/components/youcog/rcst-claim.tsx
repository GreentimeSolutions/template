import { useEffect, useState, type FormEvent } from "react";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { APP_URL } from "@/lib/youcog/miniapp";

const LAUNCH_URL = "https://farcaster.xyz/greentime1/0xa5ad5505";
type Msg = { ok: boolean; text: string; url?: string };

export function RcstClaim() {
  const miniApp = useMiniApp();
  const fc = miniApp.inMiniApp;
  const [link, setLink] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    if (!fc) return;
    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const p = await sdk.wallet.getEthereumProvider();
        const a = (await p?.request({ method: "eth_requestAccounts" })) as string[] | undefined;
        setWallet(a?.[0] ?? null);
      } catch {
        setWallet(null);
      }
    })();
  }, [fc]);

  async function quote() {
    const text = "Quote-casting the Youcognito launch on /recast. Daily $YOUCOG faucet + 1111 $RCST for quoting:";
    if (fc) {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({ text, embeds: [LAUNCH_URL, APP_URL], channelKey: "recast" }).catch(() => undefined);
    } else {
      const u = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(LAUNCH_URL)}&channelKey=recast`;
      window.open(u, "_blank", "noopener,noreferrer");
    }
  }

  async function claim(event: FormEvent) {
    event.preventDefault();
    if (busy || !link.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      if (!fc) {
        const r = await (await fetch(`/api/rcst-claim?link=${encodeURIComponent(link.trim())}`)).json();
        setMsg({ ok: false, text: r.ok ? "Your quote-cast checks out. Open Youcognito in Farcaster or the Base app to claim." : r.reason });
        return;
      }
      const { sdk } = await import("@farcaster/miniapp-sdk");
      const r = await sdk.quickAuth.fetch(`${window.location.origin}/api/rcst-claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ link: link.trim(), address: wallet ?? undefined }),
      });
      const d = await r.json();
      setMsg(d.ok ? { ok: true, text: `Sent ${Number(d.amount).toLocaleString()} RCST.`, url: d.url } : { ok: false, text: d.reason });
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the claim. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="rcst-claim" className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <p className="font-spooky text-xl tracking-wide text-ink">Quote-cast the launch, get 1111 $RCST</p>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        Quote the Youcognito launch cast, paste your quote's link, and claim 1,111 Recast on Base. One claim per Farcaster account.
      </p>
      <button type="button" onClick={() => void quote()} className="press mt-3 inline-flex h-11 w-full items-center justify-center rounded-seal border border-line text-sm font-medium text-ink">
        Quote-cast now
      </button>
      <form className="mt-3 flex flex-col gap-3" onSubmit={claim}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://farcaster.xyz/you/0x…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Your quote-cast link"
          className="h-11 min-w-0 rounded-seal border border-line bg-inset px-3 text-base text-ink placeholder:text-faint"
        />
        <button type="submit" disabled={busy || !link.trim()} className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">
          {busy ? "Checking…" : fc ? "Claim 1,111 RCST" : "Check my quote"}
        </button>
      </form>
      {!fc ? <p className="mt-2 text-xs text-mist">Claiming needs your Farcaster sign-in, so open Youcognito in Farcaster or the Base app to claim.</p> : null}
      {msg ? (
        <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-ink" : "text-danger"}`}>
          {msg.text}{" "}
          {msg.url ? <a href={msg.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">View on Basescan</a> : null}
        </p>
      ) : null}
    </section>
  );
}
