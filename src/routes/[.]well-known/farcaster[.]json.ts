import { createFileRoute } from "@tanstack/react-router";
import { APP_DOMAIN, domainFromRequest } from "@/lib/youcog/miniapp";

/** accountAssociation is signed by the owner's Farcaster account; values come from env so they drop in without code changes. */
/** youcognito.vercel.app uses FARCASTER_ASSOC_*_YOUCOGNITO (falling back to the original set); other hosts use the original set. */
function accountAssociation(domain: string) {
  const pick = (k: string) =>
    (domain === APP_DOMAIN ? process.env[`FARCASTER_ASSOC_${k}_YOUCOGNITO`]?.trim() : undefined) ||
    process.env[`FARCASTER_ASSOC_${k}`]?.trim();
  const header = pick("HEADER");
  const payload = pick("PAYLOAD");
  const signature = pick("SIGNATURE");
  if (header && payload && signature) return { header, payload, signature };
  return { header: "", payload: "", signature: "" };
}

export const Route = createFileRoute("/.well-known/farcaster.json")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const domain = domainFromRequest(request);
        const APP_URL = `https://${domain}`;
        return Response.json(
          {
            accountAssociation: accountAssociation(domain),
            baseBuilder: { ownerAddress: "0x86A3D710C42f568FA165d39C3184f41c9D179470" },
            miniapp: {
              version: "1",
              name: "Youcognito",
              iconUrl: `${APP_URL}/miniapp-icon.png`,
              homeUrl: `${APP_URL}/`,
              imageUrl: `${APP_URL}/miniapp-embed.png`,
              buttonTitle: "Claim free YOUCOG",
              splashImageUrl: `${APP_URL}/miniapp-splash.png`,
              splashBackgroundColor: "#000000",
              subtitle: "Sealed tabs and YOUCOG",
              description:
                "Open sealed tabs, ask Youcog private research missions, and claim free YOUCOG on Base once per day.",
              tagline: "Browse sealed. Claim YOUCOG.",
              primaryCategory: "utility",
              tags: ["privacy", "base", "faucet", "youcog", "research"],
              heroImageUrl: `${APP_URL}/og.jpg`,
              ogTitle: "Youcognito",
              ogDescription: "Sealed tabs, private research, and a daily YOUCOG faucet on Base.",
              ogImageUrl: `${APP_URL}/og.jpg`,
              requiredChains: ["eip155:8453"],
              canonicalDomain: domain,
            },
          },
          { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*", vary: "host" } },
        );
      },
    },
  },
});
