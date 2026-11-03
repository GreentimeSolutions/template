import { createFileRoute, Link } from "@tanstack/react-router";
import { GhostWardrobe } from "@/components/youcog/ghost-wardrobe";
import { ghostWardrobeEnabled } from "@/lib/youcog/ghost-wardrobe";

export const Route = createFileRoute("/wardrobe")({
  head: () => ({ meta: [{ title: "Ghost wardrobe (preview)" }, { name: "robots", content: "noindex" }] }),
  component: () =>
    ghostWardrobeEnabled() ? (
      <div style={{ minHeight: "100vh", background: "#0a0f2c" }}><GhostWardrobe /></div>
    ) : (
      <div style={{ padding: 24 }}>Coming soon. <Link to="/">Back</Link></div>
    ),
});
