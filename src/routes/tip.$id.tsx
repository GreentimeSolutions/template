import { createFileRoute } from "@tanstack/react-router";
import { YoucogApp } from "@/components/youcog/app";
import { APP_URL, miniAppEmbed } from "@/lib/youcog/miniapp";
import { tipPreviewImageUrl } from "@/lib/youcog/anon-tips-core";

const TITLE = "Anonymous tip · Youcognito";
const DESC = "Someone sent you an anonymous YOUCOG tip. Open Youcognito to see it.";

/** Tip cast embed page: a Mini App card (one of 5 previews per tip) that launches the app home. */
export const Route = createFileRoute("/tip/$id")({
  head: ({ params }) => {
    const imageUrl = tipPreviewImageUrl(params.id);
    const embed = { ...miniAppEmbed, imageUrl, button: { ...miniAppEmbed.button, title: "Open Youcognito" } };
    const json = JSON.stringify(embed);
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESC },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESC },
        { property: "og:url", content: `${APP_URL}/` },
        { property: "og:image", content: imageUrl },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "800" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: imageUrl },
        { name: "fc:miniapp", content: json },
        { name: "fc:frame", content: json },
      ],
      links: [{ rel: "canonical", href: `${APP_URL}/` }],
    };
  },
  component: YoucogApp,
});
