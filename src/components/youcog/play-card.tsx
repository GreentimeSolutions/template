import { Link } from "@tanstack/react-router";

/** Home entry tile for the Play page (ghostly toys on their own sites). Cosmetic/additive only. */
export function PlayCard() {
  return (
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5" data-testid="play-card">
      <p className="font-spooky text-xl tracking-wide text-ink">Play</p>
      <div className="mt-3 flex items-center gap-3">
        <img src="/play/theremancer.svg" alt="" width={48} height={48} loading="lazy" className="size-12 shrink-0 rounded-seal" />
        <p className="text-sm leading-relaxed text-mist">A haunted theremin. Wave a hand to bend the pitch and catch the ghost notes. Just for fun.</p>
      </div>
      <Link
        to="/play"
        data-testid="play-open"
        className="press mt-4 inline-flex h-11 w-full items-center justify-center rounded-seal border border-accent bg-accent/10 px-4 text-sm font-medium text-ink"
      >
        Open Play
      </Link>
    </section>
  );
}
