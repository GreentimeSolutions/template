import { createFileRoute } from "@tanstack/react-router";
import { YoucogApp } from "@/components/youcog/app";
import { miniAppEmbed } from "@/lib/youcog/miniapp";

const embed = JSON.stringify(miniAppEmbed);
const legacy = JSON.stringify({ ...miniAppEmbed, button: { ...miniAppEmbed.button, action: { ...miniAppEmbed.button.action } } });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { name: "fc:miniapp", content: embed },
      { name: "fc:frame", content: legacy },
    ],
    links: [{ rel: "preconnect", href: "https://auth.farcaster.xyz" }],
  }),
  component: YoucogApp,
});
