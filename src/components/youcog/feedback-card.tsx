import { Link } from "@tanstack/react-router";
import { FEEDBACK_REWARD_YOUCOG } from "@/constants/feedback";

/** Entry tile for the in-app feedback survey (one YOUCOG reward per person). */
export function FeedbackCard() {
  return (
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5" data-testid="feedback-card">
      <p className="font-spooky text-xl tracking-wide text-ink">Give feedback, earn YOUCOG</p>
      <p className="mt-2 text-sm leading-relaxed text-mist">
        10 quick questions, about 3 minutes. Get {FEEDBACK_REWARD_YOUCOG.toLocaleString("en-US")} YOUCOG once per person.
      </p>
      <Link
        to="/feedback"
        className="press mt-4 inline-flex h-11 w-full items-center justify-center rounded-seal bg-accent px-4 text-sm font-medium text-accent-fg"
      >
        Give feedback, earn YOUCOG
      </Link>
    </section>
  );
}
