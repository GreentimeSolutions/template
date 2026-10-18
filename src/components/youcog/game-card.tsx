import { useMiniApp } from "@/lib/youcog/use-miniapp";

const GAME_URL = "https://remix.gg/g/youcognito-run";

/** Promo card for the Youcognito Run minigame on Remix. Cosmetic/additive only. */
export function GameCard() {
  const miniApp = useMiniApp();

  return (
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5" data-testid="game-card">
      <p className="font-spooky text-xl tracking-wide text-ink">Play Youcognito Run</p>
      <div className="mt-3 flex items-center gap-4">
        <img
          src="/youcognito-run.webp"
          alt="Youcognito Run: the fedora spy ghost under a crescent moon"
          width={96}
          height={96}
          loading="lazy"
          className="size-24 shrink-0 rounded-seal shadow-[0_0_24px_rgba(167,139,250,0.35)]"
        />
        <p className="text-sm leading-relaxed text-mist">
          Float through the night, dodge the trackers, chase a high score.
        </p>
      </div>
      <a
        href={GAME_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="press mt-4 inline-flex h-11 w-full items-center justify-center rounded-seal bg-[linear-gradient(180deg,#8b5cf6,#7c3aed)] px-4 text-sm font-medium text-white"
        onClick={(event) => {
          if (!miniApp.inMiniApp) return;
          event.preventDefault();
          void import("@farcaster/miniapp-sdk")
            .then(({ sdk }) => sdk.actions.openUrl(GAME_URL))
            .catch(() => window.open(GAME_URL, "_blank", "noopener,noreferrer"));
        }}
      >
        Play on Remix
      </a>
    </section>
  );
}
