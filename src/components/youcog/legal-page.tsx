import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/youcog/site-footer";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 bg-canvas px-4 py-6 text-ink sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-spooky text-3xl tracking-wide text-violet-200">👻 {title}</p>
          <p className="text-xs text-faint">Last updated {updated}</p>
        </div>
        <Link to="/" className="press shrink-0 rounded-seal border border-line px-3 py-2 text-sm">Open app</Link>
      </header>
      <article className="legal flex flex-col gap-4 rounded-panel border border-line bg-panel p-4 text-sm leading-relaxed text-mist sm:p-6">
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-spooky text-xl tracking-wide text-ink">{title}</h2>
      {children}
    </section>
  );
}
