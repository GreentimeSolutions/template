import { createFileRoute } from "@tanstack/react-router";
import { APP_DOMAIN, LEGACY_DOMAIN, YOUCOGNITO_VERCEL_DOMAIN, domainFromRequest } from "@/lib/youcog/miniapp";

/** Signed accountAssociation for youcognito.com (fid 209707 custody). Baked in so preview/prod don't need new project env. */
const YOUCOGNITO_COM_ASSOC = {
  header: "eyJmaWQiOjIwOTcwNywidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDljQjVkYjIzRTY2NDk5YjM0ZDVlMjhERmUyMDU4M0ZlYTkwMTU4NzQifQ",
  payload: "eyJkb21haW4iOiJ5b3Vjb2duaXRvLmNvbSJ9",
  signature: "wKVN5vpYhEaVwzs46OdKroLPBZtksPrIHHsrUnM+pkMIAiHS5qxXgPTKfTK8ZJqxF8wLOO+RUM1/yvAtkaoZYBw=",
};

/** youcognito.vercel.app uses FARCASTER_ASSOC_*_YOUCOGNITO (falling back to the original set); other legacy hosts use the original set. */
function accountAssociation(domain: string) {
  if (domain === APP_DOMAIN) return YOUCOGNITO_COM_ASSOC;
  const pick = (k: string) =>
    (domain === YOUCOGNITO_VERCEL_DOMAIN ? process.env[`FARCASTER_ASSOC_${k}_YOUCOGNITO`]?.trim() : undefined) ||
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
        // Legacy vercel.app hosts keep their own host in URLs; everything else uses the apex.
        const publicDomain =
          domain === YOUCOGNITO_VERCEL_DOMAIN || domain === LEGACY_DOMAIN ? domain : APP_DOMAIN;
        const APP_URL = `https://${publicDomain}`;
        return Response.json(
          {
            accountAssociation: accountAssociation(domain),
            baseBuilder: { ownerAddress: "0x86A3D710C42f568FA165d39C3184f41c9D179470" },
            miniapp: {
              version: "1",
              name: "Youcognito",
              iconUrl: `${APP_URL}/miniapp-icon.png`,
              homeUrl: `${APP_URL}/`,
              imageUrl: `${APP_URL}/miniapp-embed.jpg?v=gift`,
              buttonTitle: "Open Youcognito",
              splashImageUrl: `${APP_URL}/miniapp-splash.png`,
              splashBackgroundColor: "#000000",
              subtitle: "Private AI research on Base",
              description: "Private AI research on Base. Sealed tabs, burnable sessions, and a daily YOUCOG faucet.",
              tagline: "Research privately on Base",
              primaryCategory: "utility",
              tags: ["privacy", "base", "faucet", "youcog", "research"],
              heroImageUrl: `${APP_URL}/og.jpg?v=gift`,
              ogTitle: "Youcognito",
              ogDescription: "Private AI research on Base with sealed tabs, burnable sessions, and a daily YOUCOG faucet.",
              ogImageUrl: `${APP_URL}/og.jpg?v=gift`,
              requiredChains: ["eip155:8453"],
              canonicalDomain: publicDomain,
            },
          },
          { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*", vary: "host" } },
        );
      },
    },
  },
});
