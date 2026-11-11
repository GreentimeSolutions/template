import { useState } from "react";
import { TIP_SUGGESTED } from "@/constants/anon-tips";
import { baseScanTxUrl, formatTipNumber } from "@/lib/youcog/anon-tips-core";

type Status = {
  ok: true;
  available: number;
  earned: number;
  tipped: number;
  giftPoints: number;
  tipCount: number;
  todayCount: number;
  todayAmount: number;
  dailyCountCap: number;
  dailyAmountCap: number;
  min: number;
  max: number;
  suggested: number[];
  pointsPerHundred: number;
  live: boolean;
  redemptionOpen: boolean;
  optedOut: boolean;
  tablesReady: boolean;
  recentTips: {
    amount: number;
    recipientUsername: string;
    giftPoints: number;
    createdAt: string;
    dryRun: boolean;
    txHash: string | null;
    held?: boolean;
    pointsPending?: boolean;
  }[];
  heldCount?: number;
  heldAmount?: number;
  pendingPoints?: number;
};

type SendResult =
  | {
      ok: true;
      amount: number;
      giftPoints: number;
      recipientUsername: string;
      castText: string;
      dryRun: boolean;
      url: string | null;
      held?: boolean;
      pointsPending?: boolean;
      message?: string;
    }
  | { ok: false; reason: string };

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const { sdk } = await import("@farcaster/miniapp-sdk");
  if (!(await sdk.isInMiniApp())) {
    throw new Error("Anonymous tips work in the Farcaster Mini App.");
  }
  const r = await sdk.quickAuth.fetch(`${window.location.origin}${path}`, init);
  return r.json();
}

export function AnonTips() {
  const [status, setStatus] = useState<Status | null>(null);
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState<number>(TIP_SUGGESTED[0]);
  const [custom, setCustom] = useState("");
  const [usingCustom, setUsingCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null);

  const chosen = usingCustom ? Number(custom) : amount;

  async function load() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const s = (await call("/api/anon-tips")) as Status | { ok: false; reason: string };
      if (!s || !("available" in s)) {
        setMsg({ ok: false, text: (s as { reason?: string })?.reason ?? "Couldn't load your tip balance." });
        setStatus(null);
      } else {
        setStatus(s);
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't load your tip balance." });
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = (await call("/api/anon-tips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, amount: chosen }),
      })) as SendResult;
      if (r.ok && r.held) {
        setMsg({ ok: true, text: r.message ?? "This tip is waiting for a quick review. Nothing has been sent yet." });
        const s = (await call("/api/anon-tips")) as Status;
        if (s && "available" in s) setStatus(s);
      } else if (r.ok) {
        const preview = r.dryRun ? " Preview only — nothing was sent or posted." : "";
        const embedNote = r.dryRun
          ? " A BaseScan transaction link would be attached."
          : "";
        setMsg({
          ok: true,
          text: `Ready: ${formatTipNumber(r.amount)} YOUCOG to @${r.recipientUsername} (${formatTipNumber(r.giftPoints)} gift point${r.giftPoints === 1 ? "" : "s"}).${preview} Post would read: ${r.castText}${embedNote}${r.pointsPending ? ` ${r.message ?? "Gift points from this tip are pending review."}` : ""}`,
          url: r.dryRun ? null : r.url,
        });
        const s = (await call("/api/anon-tips")) as Status;
        if (s && "available" in s) setStatus(s);
      } else {
        setMsg({ ok: false, text: r.reason });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "The tip couldn't go through." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleOptOut() {
    if (!status || busy) return;
    setBusy(true);
    try {
      const r = (await call("/api/anon-tips-opt-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optOut: !status.optedOut }),
      })) as { ok: boolean; optedOut?: boolean; reason?: string };
      if (r.ok) setStatus({ ...status, optedOut: Boolean(r.optedOut) });
      else setMsg({ ok: false, text: r.reason ?? "Couldn't update that setting." });
    } catch {
      setMsg({ ok: false, text: "Couldn't update that setting." });
    } finally {
      setBusy(false);
    }
  }

  const chips = status?.suggested?.length ? status.suggested : [...TIP_SUGGESTED];

  return (
    <section id="anon-tips" className="rounded-panel border border-line bg-panel p-4 sm:p-5">
      <p className="font-spooky text-xl tracking-wide text-ink">Anonymous tips</p>
      <p className="mt-1 text-sm leading-relaxed text-mist">
        Send YOUCOG to another Farcaster user from your earned faucet claims. You never deposit anything. The app wallet
        pays them and posts in /recast, so your name isn&apos;t shown. Timing can still be correlated.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-mist">
        Tips earn gift points. Rewards, if any, are announced separately.
      </p>
      {!status ? (
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="press mt-3 inline-flex h-11 w-full items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check my tip balance"}
        </button>
      ) : (
        <>
          {!status.live ? (
            <p className="mt-3 rounded-seal border border-line bg-inset px-3 py-2 text-xs leading-relaxed text-ink">
              Preview mode: the full check runs, but nothing is sent or posted.
            </p>
          ) : null}
          <p className="mt-3 text-sm text-ink">
            Available: <span className="font-medium">{status.available.toLocaleString()} YOUCOG</span>
            <span className="text-mist">
              {" "}
              · earned {status.earned.toLocaleString()} · tipped {status.tipped.toLocaleString()}
            </span>
          </p>
          <label htmlFor="anon-tip-user" className="mt-4 block text-sm font-medium text-ink">
            Farcaster username
          </label>
          <input
            id="anon-tip-user"
            value={username}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="@nick"
            className="mt-1 h-11 w-full rounded-seal border border-line bg-inset px-3 text-base text-ink placeholder:text-faint"
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="mt-3 text-sm font-medium text-ink">Amount</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tip amount">
            {chips.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={!usingCustom && amount === n}
                onClick={() => {
                  setAmount(n);
                  setUsingCustom(false);
                }}
                className={`press h-11 rounded-seal border text-xs font-medium ${
                  !usingCustom && amount === n ? "border-accent bg-accent text-accent-fg" : "border-line text-ink"
                }`}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
          <label htmlFor="anon-tip-custom" className="mt-2 block text-xs text-mist">
            Or enter {status.min.toLocaleString()}–{status.max.toLocaleString()} YOUCOG
          </label>
          <input
            id="anon-tip-custom"
            value={custom}
            inputMode="numeric"
            placeholder="Custom amount"
            className="mt-1 h-11 w-full rounded-seal border border-line bg-inset px-3 text-base text-ink placeholder:text-faint"
            onChange={(e) => {
              setCustom(e.target.value);
              setUsingCustom(true);
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !username.trim()}
            className="press mt-3 inline-flex h-11 w-full items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            {busy ? "Working…" : `Tip ${Number.isFinite(chosen) ? chosen.toLocaleString() : "—"} YOUCOG`}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-mist">
            Up to {status.dailyCountCap} tips and {status.dailyAmountCap.toLocaleString()} YOUCOG per day. Today:{" "}
            {status.todayCount}/{status.dailyCountCap} · {status.todayAmount.toLocaleString()} tipped.
          </p>
          <div className="mt-4 rounded-seal border border-line bg-inset p-3">
            <p className="text-sm font-medium text-ink">My tips &amp; gift points</p>
            <p className="mt-1 text-sm text-mist">
              {status.giftPoints.toLocaleString()} gift point{status.giftPoints === 1 ? "" : "s"} from{" "}
              {status.tipCount.toLocaleString()} tip{status.tipCount === 1 ? "" : "s"} ({status.pointsPerHundred} per 100
              YOUCOG).
            </p>
            {status.pendingPoints ? (
              <p className="mt-1 text-xs text-mist">
                {status.pendingPoints.toLocaleString()} gift point{status.pendingPoints === 1 ? "" : "s"} pending review.
              </p>
            ) : null}
            {status.heldCount ? (
              <p className="mt-1 text-xs text-mist">
                {status.heldCount} tip{status.heldCount === 1 ? "" : "s"} ({(status.heldAmount ?? 0).toLocaleString()} YOUCOG) waiting for
                review. Nothing has been sent yet, and the amount is set aside from your balance.
              </p>
            ) : null}
            {!status.redemptionOpen ? (
              <p className="mt-1 text-xs text-mist">Rewards, if any, are announced separately.</p>
            ) : null}
            {status.recentTips.length ? (
              <ul className="mt-2 space-y-1 text-xs text-mist">
                {status.recentTips.map((t, i) => (
                  <li key={`${t.createdAt}-${i}`}>
                    {formatTipNumber(t.amount)} to @{t.recipientUsername} · {formatTipNumber(t.giftPoints)} pt
                    {t.dryRun ? " · preview" : ""}
                    {t.held ? " · waiting for review" : t.pointsPending ? " · points pending" : ""}
                    {t.txHash ? (
                      <>
                        {" · "}
                        <a
                          href={baseScanTxUrl(t.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-line-strong underline-offset-4"
                        >
                          BaseScan
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-mist">No tips recorded yet.</p>
            )}
          </div>
          <button type="button" onClick={() => void toggleOptOut()} disabled={busy} className="mt-3 text-xs underline underline-offset-4 disabled:opacity-50">
            {status.optedOut ? "Allow receiving anonymous tips" : "Don't receive anonymous tips"}
          </button>
        </>
      )}
      {msg ? (
        <p role="status" className={`mt-3 text-sm leading-relaxed ${msg.ok ? "text-ink" : "text-danger"}`}>
          {msg.text}
          {msg.url ? (
            <>
              {" "}
              <a
                href={msg.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line-strong underline-offset-4"
              >
                View on Basescan
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
