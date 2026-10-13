import { useState, type FormEvent } from "react";
import { claimFaucet } from "@/lib/youcog/youcog.functions";

const AMOUNTS = [420, 1111, 6969] as const;
type Msg = { kind: "ok" | "err"; text: string; url?: string };

export function Faucet() {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState<(typeof AMOUNTS)[number]>(420);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function onClaim(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await claimFaucet({ data: { address: address.trim(), amount, website } });
      if (res.ok) {
        setMsg({ kind: "ok", text: `Sent ${res.amount.toLocaleString()} YOUCOG to your address.`, url: res.url });
      } else {
        setMsg({ kind: "err", text: res.reason });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message.replace(/^Error:\s*/, "") : "";
      setMsg({ kind: "err", text: text || "The faucet couldn't respond. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <p className="font-display text-lg text-ink">YOUCOG faucet</p>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        Claim free YOUCOG on Base once per day. One claim per address and per connection.
      </p>
      <form className="mt-4 flex flex-col gap-3" onSubmit={onClaim}>
        <label htmlFor="faucet-address" className="text-sm font-medium text-ink">
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
        <input
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Amount">
          {AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={amount === value}
              onClick={() => setAmount(value)}
              className={`press h-11 rounded-seal border text-sm font-medium ${
                amount === value ? "border-accent bg-accent text-accent-fg" : "border-line text-ink"
              }`}
            >
              {value.toLocaleString()}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || !address.trim()}
          className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? "Sending…" : `Claim ${amount.toLocaleString()} YOUCOG`}
        </button>
      </form>
      {msg ? (
        <p role="status" className={`mt-3 text-sm leading-relaxed ${msg.kind === "ok" ? "text-ink" : "text-danger"}`}>
          {msg.text}{" "}
          {msg.url ? (
            <a href={msg.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4">
              View on Basescan
            </a>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
