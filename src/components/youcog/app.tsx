import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { readSealedPage, runMission } from "@/lib/youcog/youcog.functions";
import { Brief } from "@/components/youcog/brief";
import { Faucet } from "@/components/youcog/faucet";
import { Donate } from "@/components/youcog/donate";
import { Leaderboard } from "@/components/youcog/leaderboard";
import { DeepMission } from "@/components/youcog/deep-mission";
import { ImageMaker } from "@/components/youcog/image-maker";
import { RcstClaim } from "@/components/youcog/rcst-claim";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { useSession, type SealTab } from "@/components/youcog/session";
import {
  BurnStatic,
  ClaimCelebration,
  HauntedBackdrop,
  JackOLantern,
  burnStatic,
} from "@/components/youcog/halloween";

const YOUCOG_BASESCAN = "https://basescan.org/token/0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";

type Suggestion = { label: string; mission?: string; url?: string };

const SUGGESTIONS: Suggestion[] = [
  { label: "What is the YOUCOG token on Base?", mission: "What is the YOUCOG token on Base?" },
  { label: "Open Basescan for YOUCOG in a sealed tab", url: YOUCOG_BASESCAN },
  {
    label: "Research a token privately",
    mission: "Research the YOUCOG token on Base: contract, supply, holders and recent activity",
  },
  { label: "Summarize today's Base news", mission: "Summarize today's news about the Base blockchain" },
];

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.replace(/^Error:\s*/, "");
  return "Something stopped the sealed session.";
}

function formatAge(booted: boolean, startedAt: number, now: number): string {
  if (!booted || startedAt === 0) return "--:--";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function withProtocol(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function SealMark({ vanishing = false }: { vanishing?: boolean }) {
  return (
    <span className={vanishing ? "haunt-mark is-vanishing" : "haunt-mark"}>
    <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden="true">
      <path
        className="fill-accent"
        d="M6.2 29.5V21.6c0-2.4 2.2-3.6 4.6-3.1l3.3 3.3c.6.7 1.2 1 1.9 1s1.3-.3 1.9-1l3.3-3.3c2.4-.5 4.6.7 4.6 3.1v7.9H6.2z"
      />
      <path
        className="fill-ink"
        d="M10.5 13.4h11c1.4 0 2.3 1 2.3 2.5v2.8c0 2.1-1.7 3.4-3.7 3.4h-8.2c-2 0-3.7-1.3-3.7-3.4v-2.8c0-1.5.9-2.5 2.3-2.5z"
      />
      <path className="fill-ink" d="M12.1 11.5C12.3 7.8 13.6 5.6 16 5.6s3.7 2.2 3.9 5.9h-7.8z" />
      <path
        className="fill-ink"
        d="M6.3 12.5C8 10.9 10.8 10.2 16 10.2s8 .7 9.7 2.3c.5.5.2 1.2-.6 1.2H6.9c-.8 0-1.1-.7-.6-1.2z"
      />
      <rect className="fill-canvas" x="12.3" y="10.15" width="7.4" height="1.15" rx="0.3" />
      <rect className="fill-canvas" x="10.6" y="15.2" width="4.2" height="2.5" rx="0.7" />
      <rect className="fill-canvas" x="17.2" y="15.2" width="4.2" height="2.5" rx="0.7" />
      <rect className="fill-canvas" x="14.65" y="16" width="2.7" height="0.9" rx="0.3" />
    </svg>
    <JackOLantern className="jack" />
    </span>
  );
}

const BANKR_URL =
  "https://bankr.bot/terminal/trade?out=0x92bff5d88157114dfc4a0a00f3496aa7e2e7eba3&chain=base";
const BANKR_CA = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";

function YoucogIntro({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <img
        src="/youcog-mark.png"
        alt="Youcog in a hat, glasses, and trench coat"
        className={`${compact ? "h-36 w-36" : "h-52 w-52"} rounded-2xl object-contain shadow-[0_0_36px_rgba(196,181,253,0.28)]`}
      />
      <p className="max-w-sm text-base leading-relaxed text-ink">
        Youcog opens sealed tabs for the question you give it. The sites never see your browser, and the session stays in memory until you burn it.
      </p>
      <p className="max-w-sm text-sm leading-relaxed text-mist">
        <a
          href={BANKR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ink underline decoration-line-strong underline-offset-4"
        >
          Official on @bankr
        </a>
        <span className="mt-1 block break-all">CA: {BANKR_CA}</span>
      </p>
    </div>
  );
}

function Welcome() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12 lg:px-8">
      <YoucogIntro />
      <div className="flex flex-col gap-4">
        <p className="font-spooky text-2xl tracking-wide text-violet-200">YOUCOGNITO</p>
        <h1 className="max-w-xl font-spooky text-4xl tracking-wide text-ink sm:text-5xl">
          Tabs, without a trace on your side.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-mist">
          Youcog opens sealed tabs for a question you give it. The sites never see your browser. This
          session lives only in memory.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="rounded-panel border border-line bg-panel p-4">
          <p className="text-sm font-medium text-ink">Memory only</p>
          <p className="mt-2 text-sm leading-relaxed text-mist">Refresh or Burn ends it. Nothing is written down.</p>
        </li>
        <li className="rounded-panel border border-line bg-panel p-4">
          <p className="text-sm font-medium text-ink">Storage off</p>
          <p className="mt-2 text-sm leading-relaxed text-mist">The question is sent once and not kept for later.</p>
        </li>
        <li className="rounded-panel border border-line bg-panel p-4">
          <p className="text-sm font-medium text-ink">Sealed read</p>
          <p className="mt-2 text-sm leading-relaxed text-mist">Pages load through a proxy. Scripts never run here.</p>
        </li>
      </ul>
      <div className="hidden flex-col gap-4 lg:flex">
        <Faucet />
        <RcstClaim />
        <Leaderboard />
        <Donate />
      </div>
    </div>
  );
}

function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
}: {
  tabs: SealTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={`rise flex h-11 shrink-0 items-center rounded-seal border ${
              active ? "border-line-strong bg-panel text-ink" : "border-transparent text-mist"
            }`}
          >
            <button
              type="button"
              className="h-11 max-w-40 truncate px-3 text-left text-sm"
              onClick={() => onSelect(tab.id)}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className="press grid size-11 place-items-center text-faint"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AskDock({
  mission,
  running,
  runError,
  address,
  addressError,
  trace,
  onMission,
  onOpenUrl,
  onAddress,
  onAsk,
  onOpen,
}: {
  mission: string;
  running: boolean;
  runError: string | null;
  address: string;
  addressError: string | null;
  trace: { id: string; text: string }[];
  onMission: (value: string) => void;
  onOpenUrl: (url: string) => void;
  onAddress: (value: string) => void;
  onAsk: (event: FormEvent<HTMLFormElement>) => void;
  onOpen: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="relative z-10 shrink-0 border-b border-line bg-canvas px-3 py-3 sm:px-4">
      <form className="flex items-center gap-2" onSubmit={onAsk}>
        <label htmlFor="mission" className="sr-only">
          Ask
        </label>
        <input
          id="mission"
          value={mission}
          maxLength={400}
          placeholder="Ask Youcog"
          className="h-11 min-w-0 flex-1 rounded-seal border border-line bg-inset px-3 text-base text-ink placeholder:text-faint"
          onChange={(event) => onMission(event.target.value)}
        />
        <button
          type="submit"
          disabled={running || mission.trim().length < 2}
          className="press inline-flex h-11 shrink-0 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {running ? "Searching…" : "Ask"}
        </button>
      </form>
      {runError ? <p className="mt-2 text-sm text-danger">{runError}</p> : null}
      <details className="mt-1">
        <summary className="flex h-11 cursor-pointer items-center text-sm text-mist">Suggestions and sealed address</summary>
        <div className="absolute inset-x-3 top-full z-20 mt-1 flex flex-col gap-3 rounded-shell border border-line bg-panel p-4 sm:inset-x-4">
          <div className="flex flex-col gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                className="press rounded-seal border border-line px-3 py-3 text-left text-sm leading-snug text-mist"
                onClick={() => (suggestion.url ? onOpenUrl(suggestion.url) : onMission(suggestion.mission ?? suggestion.label))}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
          <form className="flex flex-col gap-2" onSubmit={onOpen}>
            <label htmlFor="seal-url" className="text-sm font-medium text-ink">
              Open a sealed tab
            </label>
            <div className="flex gap-2">
              <input
                id="seal-url"
                value={address}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://"
                className="h-11 min-w-0 flex-1 rounded-seal border border-line bg-inset px-3 text-base text-ink placeholder:text-faint"
                onChange={(event) => onAddress(event.target.value)}
              />
              <button
                id="seal-open"
                type="submit"
                disabled={address.trim().length === 0}
                className="press inline-flex h-11 shrink-0 items-center justify-center rounded-seal border border-line px-4 text-sm font-medium text-ink disabled:opacity-50"
              >
                Open
              </button>
            </div>
            {addressError ? <p className="text-sm text-danger">{addressError}</p> : null}
          </form>
          {trace.length > 0 ? (
            <ol className="flex flex-col gap-1">
              {trace.slice(-4).map((item) => (
                <li key={item.id} className="text-sm text-faint">
                  {item.text}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </details>
    </div>
  );
}
function Reader({
  tab,
  siblings,
  onOpenUrl,
  onSelect,
  onRetry,
}: {
  tab: SealTab;
  siblings: SealTab[];
  onOpenUrl: (url: string) => void;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <article className="rise mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-faint">{tab.kind === "brief" ? "Brief" : tab.why}</p>
        <h2 className="font-display text-3xl font-medium tracking-tight text-ink">{tab.title}</h2>
        {tab.url ? <p className="truncate text-sm text-mist">{tab.url}</p> : null}
      </header>
      {tab.kind === "brief" ? <Brief text={tab.body} onOpenUrl={onOpenUrl} /> : null}
      {tab.kind === "page" && tab.status === "reading" ? (
        <p className="pulse-soft text-base text-mist">Reading through the seal. Your browser is not visiting this page.</p>
      ) : null}
      {tab.kind === "page" && tab.status === "error" ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-base text-danger">{tab.error}</p>
          <button
            type="button"
            className="press inline-flex h-11 items-center rounded-seal border border-line px-4 text-sm font-medium text-ink"
            onClick={() => onRetry(tab.id)}
          >
            Try the seal again
          </button>
        </div>
      ) : null}
      {tab.kind === "page" && tab.status === "ready" ? (
        <p className="whitespace-pre-wrap text-base leading-relaxed text-mist">{tab.body}</p>
      ) : null}
      {tab.kind === "brief" && siblings.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">Sealed tabs</p>
          <ul className="flex flex-col gap-2">
            {siblings.map((page) => (
              <li key={page.id}>
                <button
                  type="button"
                  className="press flex h-11 w-full items-center justify-between gap-3 rounded-seal border border-line px-3 text-left text-sm text-ink"
                  onClick={() => onSelect(page.id)}
                >
                  <span className="truncate">{page.title}</span>
                  <span className="shrink-0 text-faint">Open</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function YoucogApp() {
  const [faucetOpen, setFaucetOpen] = useState(false);
  const miniApp = useMiniApp();
  const booted = useSession((state) => state.booted);
  const startedAt = useSession((state) => state.startedAt);
  const now = useSession((state) => state.now);
  const mission = useSession((state) => state.mission);
  const address = useSession((state) => state.address);
  const running = useSession((state) => state.running);
  const runError = useSession((state) => state.runError);
  const tabs = useSession((state) => state.tabs);
  const activeId = useSession((state) => state.activeId);
  const trace = useSession((state) => state.trace);
  const boot = useSession((state) => state.boot);
  const tick = useSession((state) => state.tick);
  const setMission = useSession((state) => state.setMission);
  const setAddress = useSession((state) => state.setAddress);
  const beginRun = useSession((state) => state.beginRun);
  const finishRun = useSession((state) => state.finishRun);
  const failRun = useSession((state) => state.failRun);
  const openAddress = useSession((state) => state.openAddress);
  const select = useSession((state) => state.select);
  const closeTab = useSession((state) => state.closeTab);
  const markReading = useSession((state) => state.markReading);
  const retryPage = useSession((state) => state.retryPage);
  const fillPage = useSession((state) => state.fillPage);
  const failPage = useSession((state) => state.failPage);
  const burn = useSession((state) => state.burn);
  const [armed, setArmed] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [vanishing, setVanishing] = useState(false);

  useEffect(() => {
    if (!vanishing) return;
    const id = window.setTimeout(() => setVanishing(false), 1400);
    return () => window.clearTimeout(id);
  }, [vanishing]);

  const active = tabs.find((tab) => tab.id === activeId) ?? null;
  const siblings =
    active?.kind === "brief" && active.groupId
      ? tabs.filter((tab) => tab.groupId === active.groupId && tab.kind === "page")
      : [];

  useEffect(() => {
    boot();
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [boot, tick]);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  useEffect(() => {
    if (!active || active.kind !== "page" || active.status !== "idle" || !active.url) return;
    const id = active.id;
    const url = active.url;
    markReading(id);
    void readSealedPage({ data: { url } })
      .then((page) => fillPage(id, page.title, page.text, page.url))
      .catch((error: unknown) => failPage(id, messageOf(error)));
  }, [active, failPage, fillPage, markReading]);

  function openUrl(raw: string) {
    const opened = openAddress(raw);
    if (!opened) setAddressError("Only ordinary web addresses can be sealed.");
    else setAddressError(null);
  }

  return (
    <div className="haunt-shell flex h-dvh flex-col overflow-hidden text-ink">
      <HauntedBackdrop />
      <ClaimCelebration />
      <BurnStatic />
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 py-3">
        <SealMark vanishing={vanishing} />
        <div className="min-w-0">
          <p className="font-spooky text-xl leading-none tracking-wide">Youcog</p>
          <p className="truncate text-xs text-faint">Private session</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden h-11 items-center gap-2 rounded-seal border border-line px-3 text-xs text-mist sm:inline-flex">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
            Storage off
          </span>
          <span className="tabular-nums text-sm text-mist" aria-label="Session age">
            {formatAge(booted, startedAt, now)}
          </span>
          <button
            type="button"
            className={`press inline-flex h-11 items-center rounded-seal px-3 text-sm font-medium ${
              armed ? "bg-danger text-danger-fg" : "border border-line text-danger"
            }`}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              setArmed(false);
              burnStatic();
              setVanishing(true);
              burn();
            }}
          >
            {armed ? "Erase now" : "Burn"}
          </button>
        </div>
      </header>

      {tabs.length > 0 ? (
        <AskDock
          mission={mission}
          running={running}
          runError={runError}
          address={address}
          addressError={addressError}
          trace={trace}
          onMission={setMission}
          onOpenUrl={openUrl}
          onAddress={(value) => {
            setAddress(value);
            if (addressError) setAddressError(null);
          }}
          onAsk={(event) => {
            event.preventDefault();
            const text = mission.trim();
            if (text.length < 2 || running) return;
            beginRun();
            void runMission({ data: { mission: text } })
              .then((result) => finishRun(text, result.brief, result.sources))
              .catch((error: unknown) => failRun(messageOf(error)));
          }}
          onOpen={(event) => {
            event.preventDefault();
            const next = withProtocol(address);
            if (!next) return;
            openUrl(next);
          }}
        />
      ) : null}

      <div
        className={
          tabs.length > 0
            ? "min-h-0 flex-1 overflow-y-auto"
            : "grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-4 lg:grid-rows-1 lg:overflow-hidden"
        }
      >
        <section
          className={
            tabs.length > 0
              ? "min-w-0"
              : "order-1 min-h-0 min-w-0 hidden lg:order-2 lg:col-span-3 lg:block lg:overflow-y-auto"
          }
        >
          <TabStrip tabs={tabs} activeId={activeId} onSelect={select} onClose={closeTab} />
          {active ? (
            <Reader
              tab={active}
              siblings={siblings}
              onOpenUrl={openUrl}
              onSelect={select}
              onRetry={retryPage}
            />
          ) : (
            <Welcome />
          )}
        </section>

        {tabs.length === 0 ? (
        <aside className="safe-bottom order-2 flex min-h-0 flex-col gap-4 border-line px-4 py-4 lg:order-1 lg:col-span-1 lg:overflow-y-auto lg:border-r lg:px-4 lg:py-6">
          {tabs.length === 0 ? (
            <div className="flex flex-col gap-4 lg:hidden">
              <YoucogIntro compact />
              <p className="font-spooky text-3xl tracking-wide text-violet-200">YOUCOGNITO</p>
              <h1 className="font-spooky text-4xl tracking-wide">
                Tabs, without a trace on your side.
              </h1>
              <p className="text-base leading-relaxed text-mist">
                Youcog opens sealed tabs for a question you give it. The sites never see your browser.
              </p>
            </div>
          ) : null}
          <form
            className="flex flex-col gap-3 rounded-shell border border-line bg-panel p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const text = mission.trim();
              if (text.length < 2 || running) return;
              beginRun();
              void runMission({ data: { mission: text } })
                .then((result) => finishRun(text, result.brief, result.sources))
                .catch((error: unknown) => failRun(messageOf(error)));
            }}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="mission" className="text-sm font-medium text-ink">
                Mission
              </label>
              <textarea
                id="mission"
                value={mission}
                maxLength={400}
                rows={4}
                placeholder="Ask Youcog to open tabs for something."
                className="min-h-28 w-full resize-y rounded-seal border border-line bg-inset px-3 py-3 text-base text-ink placeholder:text-faint"
                onChange={(event) => setMission(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
            <button
              type="submit"
              disabled={running || mission.trim().length < 2}
              className="press inline-flex h-11 items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {running ? "Searching off your browser…" : "Run Youcog"}
            </button>
            {runError ? <p className="text-sm text-danger">{runError}</p> : null}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={faucetOpen}
                aria-controls="sidebar-faucet"
                className="press flex items-center justify-between gap-2 rounded-seal border border-accent bg-accent/10 px-3 py-3 text-left text-sm font-medium leading-snug text-ink"
                onClick={() => {
                  const next = !faucetOpen;
                  setFaucetOpen(next);
                  if (next) {
                    window.setTimeout(() => {
                      document.getElementById("sidebar-faucet")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }
                }}
              >
                <span>
                  {miniApp.inMiniApp && miniApp.user
                    ? `Claim as @${miniApp.user.username ?? `fid ${miniApp.user.fid}`} (420 / 1,111 / 6,969 daily)`
                    : "Claim free YOUCOG (420 / 1,111 / 6,969 daily)"}
                </span>
                <span aria-hidden className="text-accent">{faucetOpen ? "−" : "+"}</span>
              </button>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  className="press rounded-seal border border-line px-3 py-3 text-left text-sm leading-snug text-mist"
                  onClick={() => {
                    if (suggestion.url) {
                      openUrl(suggestion.url);
                      return;
                    }
                    setMission(suggestion.mission ?? suggestion.label);
                    document.getElementById("mission")?.focus();
                  }}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </form>
          {faucetOpen ? (
            <div id="sidebar-faucet" className="scroll-mt-4">
              <Faucet />
            </div>
          ) : null}
          <RcstClaim />
          <DeepMission onOpenUrl={openUrl} />
          <ImageMaker />
          <Leaderboard />
          <Donate />

          <form
            className="flex flex-col gap-3 rounded-shell border border-line bg-panel p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const next = withProtocol(address);
              if (!next) return;
              openUrl(next);
            }}
          >
            <label htmlFor="seal-url" className="text-sm font-medium text-ink">
              Open a sealed tab
            </label>
            <input
              id="seal-url"
              value={address}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://"
              className="h-11 w-full rounded-seal border border-line bg-inset px-3 text-base text-ink placeholder:text-faint"
              onChange={(event) => {
                setAddress(event.target.value);
                if (addressError) setAddressError(null);
              }}
            />
            <button
              id="seal-open"
              type="submit"
              disabled={address.trim().length === 0}
              className="press inline-flex h-11 items-center justify-center rounded-seal border border-line px-4 text-sm font-medium text-ink disabled:opacity-50"
            >
              Open
            </button>
            {addressError ? <p className="text-sm text-danger">{addressError}</p> : null}
          </form>

          <details className="rounded-panel border border-line px-4 py-3 text-sm text-mist">
            <summary className="flex h-11 cursor-pointer items-center text-ink">How the seal works</summary>
            <ul className="flex flex-col gap-2 pb-2">
              <li>Youcog fetches the page. Your browser does not.</li>
              <li>No cookies are sent, and page scripts never run.</li>
              <li>Your network can see that you used Youcog, not which sites were read.</li>
              <li>Burn or a refresh drops the session. It is not saved.</li>
            </ul>
          </details>

          {trace.length > 0 ? (
            <ol className="flex flex-col gap-2 px-1">
              {trace.slice(-6).map((item) => (
                <li key={item.id} className="text-sm text-faint">
                  {item.text}
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-1 text-sm text-faint">Nothing in this session is written to disk.</p>
          )}
        </aside>
        ) : null}
      </div>
    </div>
  );
}
