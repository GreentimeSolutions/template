import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/youcog/legal-page";
import { APP_URL } from "@/lib/youcog/miniapp";
import { CONTACT_EMAIL } from "@/constants/site";

const TITLE = "Privacy · Youcognito";
const DESC = "What Youcognito stores, what it doesn't, and who it works with. Plain English, no data selling.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: `${APP_URL}/privacy` },
      { property: "og:image", content: `${APP_URL}/og.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/privacy` }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="October 18, 2026">
      <p className="text-ink">
        Short version: we keep the little we need to run the faucet fairly, we never sell it, and your research sessions
        are yours to burn.
      </p>
      <LegalSection title="What we store">
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="text-ink">Wallet address</span> you claim to, verify, or tip from.</li>
          <li><span className="text-ink">Farcaster ID (fid)</span> when you use the Mini App, so each account claims once a day.</li>
          <li><span className="text-ink">Claim records:</span> day, amount, streak, and the Base transaction hash (also for $RCST quote-cast claims).</li>
          <li><span className="text-ink">Listen sessions</span> for the soundtrack boost: start and finish times, linked to your fid or address.</li>
          <li><span className="text-ink">IP address,</span> stored only as a salted hash, used for rate limits and one-claim-per-day checks.</li>
          <li><span className="text-ink">Tips and holder checks:</span> the on-chain transaction or signed message that proves them.</li>
        </ul>
      </LegalSection>
      <LegalSection title="What we don't do">
        <ul className="list-disc space-y-1 pl-5">
          <li>We don't sell, rent, or trade your data. Ever.</li>
          <li>No ad trackers and no third-party analytics cookies.</li>
          <li>
            Research sessions are burnable: your mission and the pages Youcog reads live in memory, and Burn or a refresh
            drops them. We don't keep a history of your questions.
          </li>
          <li>
            A custom ghost picture stays in your browser's localStorage. It never leaves your device. The soundtrack
            on/off setting is stored the same way.
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="Who helps run it">
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="text-ink">Base</span> (public RPC nodes) to read balances and send YOUCOG. Transactions on Base are public.</li>
          <li><span className="text-ink">Neon</span> hosts the database with the records above.</li>
          <li><span className="text-ink">xAI</span> answers research missions and reads answers aloud. Your mission text is sent to it to get an answer.</li>
          <li><span className="text-ink">Vercel</span> hosts the app and keeps standard short-lived request logs.</li>
          <li><span className="text-ink">Farcaster</span> Quick Auth confirms who you are inside the Mini App.</li>
          <li>Image making uses Black Forest Labs; trade feeds use GeckoTerminal and DexScreener; fonts come from Google Fonts.</li>
          <li>If the soundtrack plays through a <span className="text-ink">SoundCloud</span> embed, SoundCloud's own privacy policy applies to that player.</li>
        </ul>
      </LegalSection>
      <LegalSection title="Your choices">
        <p>
          Want a record removed? Email us from the account involved and we'll delete what isn't needed to prevent repeat
          claims. On-chain transactions can't be erased by anyone.
        </p>
      </LegalSection>
      <LegalSection title="Contact">
        <p>
          <a className="text-ink underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
