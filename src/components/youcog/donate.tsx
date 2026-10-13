import { withSuffix } from "@/lib/youcog/builder-code";
import { useState } from "react";

export const DONATE_ADDRESS = "0xa959d8eeded6fb440ca584d1e87e581168bbf628";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_HEX = "0x2105";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Option = { label: string; token: "ETH" | "USDC"; value: bigint };

const OPTIONS: Option[] = [
  { label: "0.0005 ETH", token: "ETH", value: 500000000000000n },
  { label: "0.002 ETH", token: "ETH", value: 2000000000000000n },
  { label: "0.004 ETH", token: "ETH", value: 4000000000000000n },
  { label: "1 USDC", token: "USDC", value: 1000000n },
  { label: "5 USDC", token: "USDC", value: 5000000n },
  { label: "10 USDC", token: "USDC", value: 10000000n },
];

async function getProvider(): Promise<Eip1193 | null> {
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    if (await sdk.isInMiniApp()) {
      const p = await sdk.wallet.getEthereumProvider();
      if (p) return p as unknown as Eip1193;
    }
  } catch {
    /* not in a mini app */
  }
  const w = (globalThis as { ethereum?: Eip1193 }).ethereum;
  return w ?? null;
}

async function ensureBase(p: Eip1193) {
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_HEX }] });
  } catch (e) {
    if ((e as { code?: number })?.code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: BASE_HEX,
          chainName: "Base",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"],
        }],
      });
    }
  }
}

function transferData(to: string, amount: bigint) {
  return "0xa9059cbb" + to.slice(2).toLowerCase().padStart(64, "0") + amount.toString(16).padStart(64, "0");
}

export function Donate() {
  const [choice, setChoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const p = await getProvider();
      if (!p) throw new Error("No wallet found. Copy the address below and send from any Base wallet.");
      const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error("No account connected.");
      await ensureBase(p);
      const opt = OPTIONS[choice];
      const tx =
        opt.token === "ETH"
          ? { from, to: DONATE_ADDRESS, value: "0x" + opt.value.toString(16), data: withSuffix() }
          : { from, to: USDC, data: withSuffix(transferData(DONATE_ADDRESS, opt.value)), value: "0x0" };
      const hash = (await p.request({ method: "eth_sendTransaction", params: [tx] })) as string;
      setMsg({ ok: true, text: `Thank you! ${opt.label} sent.`, url: `https://basescan.org/tx/${hash}` });
    } catch (e) {
      const m = (e as { message?: string })?.message ?? "Transaction failed.";
      setMsg({ ok: false, text: /reject|denied/i.test(m) ? "Transaction cancelled." : m });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(DONATE_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section id="support-youcog" className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <p className="font-display text-lg text-ink">Support Youcog</p>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        Tips on Base help fund Youcognito's Google Play listing and keep the faucet topped up.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tip amount">
        {OPTIONS.map((o, i) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={choice === i}
            onClick={() => setChoice(i)}
            className={`press h-11 rounded-seal border text-xs font-medium ${
              choice === i ? "border-accent bg-accent text-accent-fg" : "border-line text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="press mt-3 inline-flex h-11 w-full items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        {busy ? "Confirm in wallet…" : `Tip ${OPTIONS[choice].label}`}
      </button>
      <div className="mt-3 flex items-center gap-2 text-xs text-mist">
        <span className="min-w-0 truncate font-mono">{DONATE_ADDRESS}</span>
        <button type="button" onClick={copy} className="shrink-0 underline underline-offset-4">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {msg ? (
        <p role="status" className={`mt-3 text-sm leading-relaxed ${msg.ok ? "text-ink" : "text-danger"}`}>
          {msg.text}{" "}
          {msg.url ? (
            <a href={msg.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              View on Basescan
            </a>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
