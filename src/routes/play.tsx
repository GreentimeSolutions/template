import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_URL } from "@/lib/youcog/miniapp";
import { SiteFooter } from "@/components/youcog/site-footer";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
import { openExternal } from "@/lib/youcog/open-external";
import { PLAY_ENTRIES, type PlayEntry } from "@/constants/play";

const TITLE = "Play · Youcognito";
const DESC = "Ghostly toys from the Youcognito team, starting with a haunted camera theremin. Just for fun.";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${APP_URL}/play` },
      { property: "og:image", content: `${APP_URL}/og.jpg?v=gift` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${APP_URL}/og.jpg?v=gift` },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/play` }],
  }),
  component: PlayPage,
});

function PlayTile({ entry, inMiniApp }: { entry: PlayEntry; inMiniApp: boolean }) {
  return (
    <section className="rounded-panel border border-line bg-panel p-4 sm:p-5" data-testid={`play-${entry.id}`}>
      <div className="flex items-start gap-4">
        <img
          src={entry.thumb}
          alt=""
          width={80}
          height={80}
          className="size-20 shrink-0 rounded-seal shadow-[0_0_24px_rgba(167,139,250,0.35)]"
        />
        <div className="min-w-0">
          <h2 className="font-spooky text-2xl tracking-wide text-ink">{entry.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-mist">{entry.blurb}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-faint">{entry.note}</p>
      {entry.url ? (
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`play-${entry.id}-open`}
          className="press mt-4 inline-flex h-11 w-full items-center justify-center rounded-seal bg-[linear-gradient(180deg,#8b5cf6,#7c3aed)] px-4 text-sm font-medium text-white"
          onClick={(event) => {
            if (!inMiniApp) return;
            event.preventDefault();
            openExternal(entry.url as string, true);
          }}
        >
          Open {entry.title}
        </a>
      ) : (
        <p className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-seal border border-line text-sm text-faint">
          Opening soon
        </p>
      )}
    </section>
  );
}

function PlayPage() {
  const miniApp = useMiniApp();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-canvas px-4 py-6 text-ink sm:py-10" data-testid="play-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-spooky text-4xl tracking-wide text-ink">Play</h1>
          <p className="mt-1 text-base leading-relaxed text-mist">
            Little ghostly experiments from the Youcognito team. Each one opens on its own separate site, apart from
            the app. Just for fun.
          </p>
        </div>
        <Link to="/" className="press shrink-0 rounded-seal border border-line px-3 py-2 text-sm">
          Open app
        </Link>
      </header>
      {PLAY_ENTRIES.map((entry) => (
        <PlayTile key={entry.id} entry={entry} inMiniApp={miniApp.inMiniApp} />
      ))}
      <SiteFooter className="mt-2" />
    </main>
  );
}
