import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/youcog/legal-page";
import { APP_URL } from "@/lib/youcog/miniapp";
import { CONTACT_EMAIL } from "@/constants/site";

const TITLE = "Terms · Youcognito";
const DESC = "The plain-English terms for using Youcognito, an experimental private research app on Base.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${APP_URL}/terms` },
      { property: "og:image", content: `${APP_URL}/og.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${APP_URL}/og.jpg` },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/terms` }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms" updated="October 18, 2026">
      <p className="text-ink">By using Youcognito you agree to these terms. They're short on purpose.</p>
      <LegalSection title="An experiment">
        <p>
          Youcognito is an experimental app built in the open. Features can change, break, or disappear without notice.
        </p>
      </LegalSection>
      <LegalSection title="YOUCOG has no promised value">
        <p>
          YOUCOG is a community token on Base. Nobody promises it will be worth anything, now or later. Nothing here is
          financial, investment, legal, or tax advice. Do your own research and never spend more than you can afford to
          lose.
        </p>
      </LegalSection>
      <LegalSection title="The faucet">
        <p>
          The daily faucet is a community giveaway while supplies last. Amounts, streak bonuses, the listen boost, and
          limits can change or stop at any time. One claim per person per day.
        </p>
      </LegalSection>
      <LegalSection title="Play fair">
        <p>
          No bots, scripts, multiple accounts, or other tricks to claim more than your share, and no attacking or
          overloading the service. We can block addresses, accounts, or connections that abuse it.
        </p>
      </LegalSection>
      <LegalSection title="Research answers">
        <p>
          Youcog's answers are written by AI from public web pages. They can be wrong or out of date, so check anything
          important.
        </p>
      </LegalSection>
      <LegalSection title="As is">
        <p>
          Youcognito is provided as is, without warranties of any kind. To the extent the law allows, we aren't liable
          for losses from using it, including lost tokens, failed transactions, or wallet mistakes. Your wallet and keys
          are your responsibility.
        </p>
      </LegalSection>
      <LegalSection title="Contact">
        <p>
          Questions? <a className="text-ink underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
