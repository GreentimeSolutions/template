import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  StreakCounter,
  type StreakCounterState,
} from "@/components/youcog/streak-counter";
import { baseScanTxUrl } from "@/lib/youcog/anon-tips-core";
import { openExternal } from "@/lib/youcog/open-external";
import {
  formatAmount,
  whenLabel,
  type TimelineEvent,
} from "@/lib/youcog/streak-timeline-core";

type TimelineResponse =
  | {
      ok: true;
      fid: number;
      streak: StreakCounterState | null;
      events: TimelineEvent[];
      nextBefore: string | null;
    }
  | { ok: false; reason: string };

/** Quick Auth only runs here, after the user taps — never on mount (keeps the a888283 minimize fix intact). */
async function fetchTimeline(before?: string): Promise<TimelineResponse> {
  const { sdk } = await import("@farcaster/miniapp-sdk");
  if (!(await sdk.isInMiniApp()))
    return {
      ok: false,
      reason: "Open Youcognito in Farcaster to see your streak and tips.",
    };
  const q = new URLSearchParams({ limit: "30" });
  if (before) q.set("before", before);
  const r = await sdk.quickAuth.fetch(
    `${window.location.origin}/api/streak-timeline?${q}`,
  );
  return (await r.json()) as TimelineResponse;
}

/** Small entry link under the faucet streak counter; opens the "Your streak & tips" sheet. */
export function StreakTimelineButton({
  flameKey,
  refreshKey = 0,
}: {
  flameKey: string;
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-testid="streak-timeline-open"
          className="press mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink underline decoration-line-strong underline-offset-4"
        >
          Your streak &amp; tips 👻
        </button>
      </Dialog.Trigger>
      {open ? (
        <StreakTimelineSheet key={refreshKey} flameKey={flameKey} />
      ) : null}
    </Dialog.Root>
  );
}

function StreakTimelineSheet({ flameKey }: { flameKey: string }) {
  const [streak, setStreak] = useState<StreakCounterState | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function load(before?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchTimeline(before);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      if (!before && res.streak) setStreak(res.streak);
      setEvents((prev) =>
        before
          ? [
              ...prev,
              ...res.events.filter((e) => !prev.some((p) => p.id === e.id)),
            ]
          : res.events,
      );
      setNextBefore(res.nextBefore);
    } catch {
      setError("Couldn't load your timeline. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // The sheet only mounts after the user's tap, so this load is user-initiated.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
      <Dialog.Content
        data-testid="streak-timeline"
        aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:bottom-6"
      >
        {/* Inner card: .bg-panel.rounded-panel adds the cobweb corners (and position: relative), so it can't be the fixed element. */}
        <div className="rounded-panel bg-canvas">
          <div className="flex max-h-[88dvh] flex-col overflow-hidden rounded-panel border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="font-spooky text-xl tracking-wide text-ink">
                Your streak &amp; tips 👻
              </Dialog.Title>
              <Dialog.Close
                className="press -mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-seal text-mist"
                aria-label="Close"
              >
                ✕
              </Dialog.Close>
            </div>
            <div className="-mx-1 mt-1 min-h-0 flex-1 overflow-y-auto px-1">
              {streak ? (
                <StreakCounter streak={streak} flameKey={flameKey} />
              ) : null}
              {events.length ? (
                <ol className="mt-3.5" aria-label="Your recent claims and tips">
                  {events.map((e, i) => (
                    <TimelineItem
                      key={e.id}
                      event={e}
                      last={i === events.length - 1}
                    />
                  ))}
                </ol>
              ) : !busy && !error ? (
                <p className="mt-4 text-sm text-mist">
                  No claims or tips yet. Claim today&apos;s faucet gift to start
                  your streak.
                </p>
              ) : null}
              {busy ? (
                <p className="mt-3 text-sm text-mist" role="status">
                  Loading…
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 text-sm text-danger" role="status">
                  {error}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => void load()}
                  >
                    Retry
                  </button>
                </p>
              ) : null}
              {nextBefore && !busy ? (
                <button
                  type="button"
                  onClick={() => void load(nextBefore)}
                  className="press mt-3 inline-flex h-9 items-center justify-center rounded-seal border border-line px-3 text-xs font-medium text-ink"
                >
                  Show older
                </button>
              ) : null}
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                Only you can see this. Tips stay anonymous to everyone else.
              </p>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function TimelineItem({
  event,
  last,
}: {
  event: TimelineEvent;
  last: boolean;
}) {
  const dot =
    event.kind === "tip"
      ? "bg-[#c4b8d6] shadow-[0_0_0_3px_rgb(196_181_253/0.16)]"
      : event.bonus
        ? "bg-[#fbbf24] shadow-[0_0_0_3px_rgb(251_191_36/0.2)]"
        : "bg-accent shadow-[0_0_0_3px_rgb(215_221_230/0.14)]";
  return (
    <li
      className="relative grid grid-cols-[22px_1fr] gap-2.5"
      data-kind={event.kind}
    >
      <div className="relative flex justify-center">
        <span
          className={`z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
        />
        {last ? null : (
          <span
            aria-hidden="true"
            className="absolute top-[18px] -bottom-0.5 w-px bg-line"
          />
        )}
      </div>
      <div className={`min-w-0 ${last ? "" : "pb-3.5"}`}>
        <p className="text-xs leading-tight text-faint">
          {whenLabel(event.day)}
        </p>
        {event.kind === "claim" ? (
          <>
            <p className="mt-px text-sm font-medium leading-snug text-ink">
              Day {event.streakDay} claim
              {event.bonus ? (
                <span className="ml-1.5 inline-block rounded-full bg-[rgb(251_191_36/0.16)] px-[7px] py-px align-[1px] text-[11px] font-semibold text-[#fde68a]">
                  3x
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-mist">
              {formatAmount(event.amount)} YOUCOG ·{" "}
              {event.bonus ? "streak bonus" : "daily faucet gift"}
            </p>
          </>
        ) : (
          <>
            <p className="mt-px truncate text-sm font-medium leading-snug text-ink">
              Tip sent to @{event.recipientUsername}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-mist">
              {formatAmount(event.amount)} YOUCOG ·{" "}
              {event.state === "sent" && event.txHash ? (
                <a
                  href={baseScanTxUrl(event.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(ev) => {
                    ev.preventDefault();
                    openExternal(baseScanTxUrl(event.txHash!), true);
                  }}
                  className="font-medium text-ink underline decoration-line-strong underline-offset-4"
                >
                  Verified on Base
                </a>
              ) : (
                "held for review"
              )}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
