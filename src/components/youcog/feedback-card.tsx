import { Link } from "@tanstack/react-router";

/** Entry tile for the in-app feedback survey (one-time YOUCOG thank-you gift per person). */
export function FeedbackCard() {
  return (
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5" data-testid="feedback-card">
      <p className="font-spooky text-xl tracking-wide text-ink">Share feedback</p>
      <p className="mt-2 text-sm leading-relaxed text-mist">
        10 quick questions, about 3 minutes. As a thank-you, a one-time YOUCOG gift may be sent while supplies last. YOUCOG has no promised value.
      </p>
      <Link
        to="/feedback"
        className="press mt-4 inline-flex h-11 w-full items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg"
      >
        Share feedback
      </Link>
    </section>
  );
}
