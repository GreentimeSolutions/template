import { createFileRoute } from "@tanstack/react-router";
import { YoucogApp } from "@/components/youcog/app";
import { APP_URL, miniAppEmbed } from "@/lib/youcog/miniapp";
import { SITE_DESCRIPTION } from "@/constants/site";

const embed = JSON.stringify(miniAppEmbed);
const legacy = JSON.stringify({ ...miniAppEmbed, button: { ...miniAppEmbed.button, action: { ...miniAppEmbed.button.action } } });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Youcognito · Private AI research on Base" },
      { property: "og:title", content: "Youcognito · Private AI research on Base" },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: `${APP_URL}/` },
      { property: "og:image", content: `${APP_URL}/og.jpg?v=ghost` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Youcognito" },
      { name: "twitter:title", content: "Youcognito · Private AI research on Base" },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: `${APP_URL}/og.jpg?v=ghost` },
      { name: "fc:miniapp", content: embed },
      { name: "fc:frame", content: legacy },
    ],
    links: [
      { rel: "canonical", href: `${APP_URL}/` },
      { rel: "preconnect", href: "https://auth.farcaster.xyz" },
    ],
  }),
  component: YoucogApp,
});
