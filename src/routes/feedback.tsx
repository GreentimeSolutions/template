import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { APP_URL } from "@/lib/youcog/miniapp";
import { SiteFooter } from "@/components/youcog/site-footer";
import { celebrate } from "@/components/youcog/halloween";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { connectedBaseAddress } from "@/lib/youcog/wallet";
import { FEEDBACK_NA, FEEDBACK_QUESTIONS, validateFeedback, type FeedbackAnswers } from "@/lib/youcog/feedback-core";

const TITLE = "Share feedback · Youcognito";
const DESC = "Answer 10 quick questions about Youcognito. As a thank-you, a one-time YOUCOG gift may be sent while supplies last.";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${APP_URL}/feedback` },
      { property: "og:image", content: `${APP_URL}/og.jpg?v=ghost` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${APP_URL}/og.jpg?v=ghost` },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/feedback` }],
  }),
  component: FeedbackPage,
});

type Result = { ok: true; amount: number; url: string } | { ok: false; reason: string; field?: string; done?: boolean };

const chip = (on: boolean, center = false) =>
  `press min-h-11 rounded-seal border px-3 py-2 ${center ? "text-center" : "text-left"} text-sm font-medium ${
    on ? "border-accent bg-accent text-accent-fg" : "border-line bg-inset text-ink"
  }`;

async function call(fc: boolean, path: string, init?: RequestInit) {
  if (fc) {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    return sdk.quickAuth.fetch(`${window.location.origin}${path}`, init);
  }
  return fetch(path, init);
}

function FeedbackPage() {
  const miniApp = useMiniApp();
  const fc = miniApp.inMiniApp;
  const [answers, setAnswers] = useState<FeedbackAnswers>({});
  const [address, setAddress] = useState("");
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!fc) return;
    connectedBaseAddress()
      .then((a) => setWalletAddr(a))
      .catch(() => setWalletAddr(null));
  }, [fc]);

  const recipient = fc && walletAddr && !useOther ? walletAddr : address.trim();
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient);

  // Already rewarded? (FID in the Mini App, or the typed address on the web.)
  useEffect(() => {
    if (!miniApp.checked || (!fc && !validRecipient)) return;
    const q = validRecipient ? `?address=${recipient}` : "";
    call(fc, `/api/feedback${q}`)
      .then((r) => r.json())
      .then((s: { done?: boolean }) => setDone(Boolean(s.done)))
      .catch(() => undefined);
  }, [miniApp.checked, fc, recipient, validRecipient]);

  const set = (id: string, v: string | string[] | number) => setAnswers((a) => ({ ...a, [id]: v }));
  const answered = FEEDBACK_QUESTIONS.filter((q) => {
    if (q.kind === "text" && q.optional) return false;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : typeof v === "number" ? true : typeof v === "string" && v.trim().length > 0;
  }).length;
  const required = FEEDBACK_QUESTIONS.filter((q) => !(q.kind === "text" && q.optional)).length;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const local = validateFeedback(answers);
    if (!local.ok) {
      setResult({ ok: false, reason: local.reason, field: local.field });
      if (local.field) document.getElementById(`fb-${local.field}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!validRecipient) {
      setResult({ ok: false, reason: "Enter your Base address so we know where to send your YOUCOG.", field: "address" });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await call(fc, "/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: local.answers, address: recipient, website }),
      });
      const res = (await r.json()) as Result;
      setResult(res);
      if (res.ok || res.done) setDone(true);
      // Cosmetic: only after the server confirmed the reward was sent, with the amount it reports.
      if (res.ok) celebrate({ amount: res.amount, subtitle: "Thanks for the feedback" });
    } catch {
      setResult({ ok: false, reason: "Couldn't send your feedback. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-canvas px-4 py-6 text-ink sm:py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-spooky text-3xl tracking-wide text-ink">Share feedback</h1>
          <p className="mt-1 text-base leading-relaxed text-mist">
            10 quick questions, about 3 minutes, to help decide what gets built. As a thank-you, a one-time YOUCOG gift may be
            sent from the faucet while supplies last. It is a giveaway, not payment. YOUCOG has no promised value.
          </p>
        </div>
        <Link to="/" className="press shrink-0 rounded-seal border border-line px-3 py-2 text-sm">
          Open app
        </Link>
      </header>

      {result?.ok ? (
        <section role="status" className="rounded-panel border border-accent bg-panel p-4 text-base leading-relaxed">
          <p className="font-spooky text-xl tracking-wide">Thank you!</p>
          <p className="mt-1">
            Sent {result.amount.toLocaleString("en-US")} YOUCOG to your address.{" "}
            <a href={result.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              View on Basescan
            </a>
          </p>
        </section>
      ) : done ? (
        <section className="rounded-panel border border-line bg-panel p-4 text-base leading-relaxed text-mist">
          You already sent feedback. Thanks for helping shape Youcognito!
        </section>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <p className="text-sm text-mist">
            {fc
              ? `One thank-you gift per Farcaster account${miniApp.user?.username ? ` (@${miniApp.user.username})` : ""} and per wallet.`
              : "One thank-you gift per wallet and per connection."}{" "}
            You need at least one faucet claim first.
          </p>

          {FEEDBACK_QUESTIONS.map((q, i) => {
            const bad = result && !result.ok && result.field === q.id;
            return (
              <fieldset
                key={q.id}
                id={`fb-${q.id}`}
                className={`scroll-mt-4 rounded-panel border bg-panel p-4 ${bad ? "border-danger" : "border-line"}`}
              >
                <legend className="sr-only">{q.label}</legend>
                <p className="text-base font-medium leading-snug text-ink" aria-hidden="true">
                  {q.id === "comment" ? "Optional: " : `${i + 1}. `}
                  {q.label}
                </p>
                {q.kind === "single" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={q.label}>
                    {q.options.map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={answers[q.id] === o} className={chip(answers[q.id] === o)} onClick={() => set(q.id, o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                ) : q.kind === "multi" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {q.options.map((o) => {
                      const list = (answers[q.id] as string[] | undefined) ?? [];
                      const on = list.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          className={chip(on)}
                          onClick={() => set(q.id, on ? list.filter((x) => x !== o) : [...list, o])}
                        >
                          {on ? "✓ " : ""}
                          {o}
                        </button>
                      );
                    })}
                  </div>
                ) : q.kind === "scale" ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.label}>
                      {Array.from({ length: q.max - q.min + 1 }, (_, k) => q.min + k).map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={answers[q.id] === n}
                          className={`${chip(answers[q.id] === n, true)} min-w-11`}
                          onClick={() => set(q.id, n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-sm text-mist">
                      <span>
                        {q.min} = {q.minLabel}
                      </span>
                      <span>
                        {q.max} = {q.maxLabel}
                      </span>
                    </div>
                    {q.naLabel ? (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={answers[q.id] === FEEDBACK_NA}
                        className={`${chip(answers[q.id] === FEEDBACK_NA)} mt-2`}
                        onClick={() => set(q.id, FEEDBACK_NA)}
                      >
                        {q.naLabel}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <textarea
                    aria-label={q.label}
                    rows={q.optional ? 4 : 2}
                    maxLength={q.optional ? 1000 : 500}
                    placeholder={q.placeholder}
                    value={(answers[q.id] as string | undefined) ?? ""}
                    onChange={(e) => set(q.id, e.target.value)}
                    className="mt-3 w-full rounded-seal border border-line bg-inset px-3 py-2 text-base text-ink placeholder:text-faint"
                  />
                )}
                {bad && result && !result.ok ? <p className="mt-2 text-sm text-danger">{result.reason}</p> : null}
              </fieldset>
            );
          })}

          <section
            id="fb-address"
            className={`scroll-mt-4 rounded-panel border bg-panel p-4 ${result && !result.ok && result.field === "address" ? "border-danger" : "border-line"}`}
          >
            <p className="text-base font-medium text-ink">Where should we send the thank-you gift?</p>
            {fc && walletAddr ? (
              <div className="mt-2 flex flex-col gap-1 text-sm text-mist">
                <span>
                  Sending to{" "}
                  {useOther ? "another address" : <span className="font-mono text-ink">{walletAddr.slice(0, 6)}…{walletAddr.slice(-4)}</span>}
                </span>
                <button type="button" className="self-start underline underline-offset-4" onClick={() => setUseOther(!useOther)}>
                  {useOther ? "Use my connected wallet" : "Paste a different address"}
                </button>
              </div>
            ) : null}
            {!fc || !walletAddr || useOther ? (
              <>
                <label htmlFor="feedback-address" className="mt-2 block text-sm text-mist">
                  Your Base address (the one you claim the faucet with)
                </label>
                <input
                  id="feedback-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 h-11 w-full min-w-0 rounded-seal border border-line bg-inset px-3 font-mono text-base text-ink placeholder:text-faint"
                />
              </>
            ) : null}
          </section>

          <input
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="off"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <button
            type="submit"
            disabled={busy}
            className="press inline-flex h-12 items-center justify-center rounded-seal bg-accent px-4 text-base font-medium text-accent-fg disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send feedback"}
          </button>
          <p className="text-center text-sm text-mist">
            {answered} of {required} answered
          </p>
          {result && !result.ok ? (
            <p role="alert" aria-live="polite" className="text-base leading-relaxed text-danger">
              {result.reason}
            </p>
          ) : null}
        </form>
      )}
      <SiteFooter className="mt-2" />
    </main>
  );
}
