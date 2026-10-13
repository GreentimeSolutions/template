import { useEffect, useState, type FormEvent } from "react";
import { Brief } from "@/components/youcog/brief";
import { useMiniApp } from "@/lib/youcog/use-miniapp";

const TOKEN = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";
export const BUY_URL = `https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${TOKEN}`;
const SESSION_KEY = "youcog-holder-session";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Status = { holder: boolean; verified?: boolean; balance?: number; min?: number; excluded?: boolean; address?: string | null };
type Result = { brief: string; sources: { url: string; title: string }[] };

async function authedFetch(path: string, init: RequestInit = {}, inMiniApp: boolean) {
  const headers = new Headers(init.headers);
  const session = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
  if (session) headers.set("x-holder-session", session);
  if (inMiniApp) {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    return sdk.quickAuth.fetch(`${window.location.origin}${path}`, { ...init, headers });
  }
  return fetch(path, { ...init, headers });
}

export function DeepMission({ onOpenUrl }: { onOpenUrl: (url: string) => void }) {
  const miniApp = useMiniApp();
  const fc = miniApp.inMiniApp;
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mission, setMission] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function refresh() {
    try {
      const r = await authedFetch("/api/holder", {}, fc);
      setStatus(await r.json());
    } catch {
      setStatus({ holder: false });
    }
  }
  useEffect(() => {
    if (miniApp.checked) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miniApp.checked, fc]);

  async function verifyWallet() {
    setBusy(true);
    setNote("");
    try {
      const eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
      if (!eth) throw new Error("No wallet found. Open Youcognito in a wallet browser or the Base app.");
      const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const c = await (await fetch("/api/holder-nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })).json();
      if (!c.message) throw new Error(c.error ?? "Couldn't start verification.");
      const signature = await eth.request({ method: "personal_sign", params: [c.message, address] });
      const v = await (await fetch("/api/holder-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: c.message, mac: c.mac, signature }),
      })).json();
      if (v.session) sessionStorage.setItem(SESSION_KEY, v.session);
      if (v.error || v.reason) setNote(v.error ?? v.reason);
      setStatus({ ...v, verified: !!v.session });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Verification failed.";
      setNote(/reject|denied/i.test(m) ? "Signature cancelled." : m);
    } finally {
      setBusy(false);
    }
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    if (busy || mission.trim().length < 2) return;
    setBusy(true);
    setNote("");
    setResult(null);
    try {
      const r = await authedFetch("/api/deep-mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mission }),
      }, fc);
      const d = await r.json();
      if (d.ok) setResult(d);
      else setNote(d.reason ?? "Deep Mission failed.");
    } catch {
      setNote("Deep Mission couldn't respond. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const min = (status?.min ?? 10_000_000).toLocaleString();
  const unlocked = !!status?.holder;

  return (
    <section id="deep-mission" className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg text-ink">Deep Mission</p>
        <span className={`rounded-seal border px-2 py-0.5 text-xs ${unlocked ? "border-accent bg-accent text-accent-fg" : "border-line text-mist"}`}>
          {unlocked ? "Holder" : "🔒 Locked"}
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        A longer report with more sources, holder, liquidity and contract analysis, and a risk score.
      </p>
      {unlocked ? (
        <form className="mt-3 flex flex-col gap-3" onSubmit={run}>
          <textarea
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            rows={2}
            placeholder="e.g. Deep dive YOUCOG 0x92Bf…EbA3 on Base"
            className="min-w-0 rounded-seal border border-line bg-inset px-3 py-2 text-base text-ink placeholder:text-faint"
          />
          <button type="submit" disabled={busy} className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">
            {busy ? "Researching… (up to a minute)" : "Run Deep Mission"}
          </button>
          <p className="text-xs text-mist">
            Verified {status?.address ? `${status.address.slice(0, 6)}…${status.address.slice(-4)}` : ""} · {Math.floor(status?.balance ?? 0).toLocaleString()} YOUCOG
          </p>
        </form>
      ) : (
        <div data-testid="perk-locked" className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-ink">Hold {min} $YOUCOG (~$1) to unlock.</p>
          {status?.verified && !status.holder ? (
            <p className="text-xs text-mist">
              {status.excluded ? "The faucet wallet can't use holder perks. " : ""}
              Your verified wallet holds {Math.floor(status.balance ?? 0).toLocaleString()} YOUCOG.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <a href={BUY_URL} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-3 text-sm font-medium text-accent-fg">
              Buy YOUCOG
            </a>
            {fc ? (
              <button type="button" onClick={() => void refresh()} className="press h-11 rounded-seal border border-line text-sm text-ink">
                Re-check
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void verifyWallet()} className="press h-11 rounded-seal border border-line text-sm text-ink disabled:opacity-50">
                {busy ? "Check wallet…" : "Verify wallet"}
              </button>
            )}
          </div>
          {fc ? <p className="text-xs text-mist">In Farcaster we check the wallets verified on your account.</p> : null}
        </div>
      )}
      {note ? <p role="status" className="mt-3 text-sm text-danger">{note}</p> : null}
      {result ? (
        <div className="mt-4 flex flex-col gap-3">
          <Brief text={result.brief} onOpenUrl={onOpenUrl} />
          {result.sources?.length ? (
            <ul className="flex flex-col gap-1 text-xs">
              {result.sources.map((s) => (
                <li key={s.url}>
                  <button type="button" onClick={() => onOpenUrl(s.url)} className="underline underline-offset-4 text-mist">{s.title}</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
