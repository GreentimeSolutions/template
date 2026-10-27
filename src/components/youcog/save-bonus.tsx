import { useEffect, useState } from "react";
import { SAVE_BONUS_HOLD_DAYS, SAVE_BONUS_RATE_LABEL } from "@/constants/save-bonus";

type Status =
  | { open: false }
  | { open: true; ready: number; readyBonus: number; nextUnlockAt: string | null; nextBonus: number; paidTotal: number };
type Result =
  | { ok: true; total: number; paid: { url: string }[]; skipped: { reason: string }[] }
  | { ok: false; reason: string };

/**
 * "Claim save bonus": a claim whose YOUCOG is still in the wallet after 7 days
 * can collect 10% of that claim, once. The server reads the wallet balance on
 * Base when tapped; nothing here decides the amount.
 */
export function SaveBonus({ fc, address, refreshKey }: { fc: boolean; address: string; refreshKey: number }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const validAddress = /^0x[0-9a-fA-F]{40}$/.test(address);

  async function call(method: "GET" | "POST") {
    const url = fc ? `${window.location.origin}/api/save-bonus` : `/api/save-bonus${method === "GET" ? `?address=${address}` : ""}`;
    const init: RequestInit =
      method === "POST"
        ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(fc ? {} : { address }) }
        : { method };
    if (fc) {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      return (await sdk.quickAuth.fetch(url, init)).json();
    }
    return (await fetch(url, init)).json();
  }

  async function load() {
    if (!fc && !validAddress) return setStatus(null);
    try {
      setStatus((await call("GET")) as Status);
    } catch {
      setStatus(null);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc, address, refreshKey]);

  async function onCollect() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = (await call("POST")) as Result;
      if (r.ok) {
        const note = r.skipped.map((s) => s.reason).filter(Boolean).join(" ");
        setMsg({ ok: true, text: `Save bonus sent: ${r.total.toLocaleString()} YOUCOG.${note ? ` ${note}` : ""}`, url: r.paid[0]?.url });
      } else setMsg({ ok: false, text: r.reason });
      void load();
    } catch {
      setMsg({ ok: false, text: "The save bonus couldn't respond. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!status?.open) return null;
  return (
    <div data-testid="save-bonus" className="mt-2 rounded-seal border border-line p-3 text-xs leading-relaxed text-mist">
      <p>
        <span className="font-medium text-ink">Save bonus:</span> keep the YOUCOG you claim in the same wallet for{" "}
        {SAVE_BONUS_HOLD_DAYS} days, then tap Claim save bonus for an extra {SAVE_BONUS_RATE_LABEL} of that claim, once per
        claim. We check the wallet's YOUCOG balance on Base when you tap. Paid from the daily faucet budget while supplies
        last. YOUCOG has no promised value.
      </p>
      {status.ready > 0 ? (
        <button
          type="button"
          onClick={() => void onCollect()}
          disabled={busy}
          className="press mt-2 inline-flex h-10 items-center justify-center rounded-seal border border-accent px-3 text-sm font-medium text-ink disabled:opacity-50"
        >
          {busy ? "Checking…" : `Claim save bonus (+${status.readyBonus.toLocaleString()} YOUCOG)`}
        </button>
      ) : status.nextUnlockAt ? (
        <p className="mt-1 text-ink">
          Next save bonus (+{status.nextBonus.toLocaleString()}) unlocks{" "}
          {new Date(status.nextUnlockAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
        </p>
      ) : null}
      {status.paidTotal > 0 ? <p className="mt-1">Save bonuses collected so far: {status.paidTotal.toLocaleString()} YOUCOG.</p> : null}
      {msg ? (
        <p role="status" className={`mt-1 text-sm ${msg.ok ? "text-ink" : "text-danger"}`}>
          {msg.text}{" "}
          {msg.url ? (
            <a href={msg.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              View on Basescan
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
