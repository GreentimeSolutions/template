import { createFileRoute } from "@tanstack/react-router";
import { APP_DOMAIN, APP_URL } from "@/lib/youcog/miniapp";

/** accountAssociation is signed by the owner's Farcaster account; values come from env so they drop in without code changes. */
function accountAssociation() {
  const header = process.env.FARCASTER_ASSOC_HEADER?.trim();
  const payload = process.env.FARCASTER_ASSOC_PAYLOAD?.trim();
  const signature = process.env.FARCASTER_ASSOC_SIGNATURE?.trim();
  if (header && payload && signature) return { header, payload, signature };
  return { header: "", payload: "", signature: "" };
}

export const Route = createFileRoute("/.well-known/farcaster.json")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            accountAssociation: accountAssociation(),
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
              canonicalDomain: APP_DOMAIN,
            },
          },
          { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
        ),
    },
  },
});
