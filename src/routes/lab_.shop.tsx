import { createFileRoute, Link } from "@tanstack/react-router";
import { CosmeticsStore } from "@/components/youcog/cosmetics-store";
import { ghostLabEnabled } from "@/lib/youcog/ghost-lab";

export const Route = createFileRoute("/lab_/shop")({
  head: () => ({ meta: [{ title: "Ghost Shop (preview)" }, { name: "robots", content: "noindex" }] }),
  component: () =>
    ghostLabEnabled() ? (
      <div style={{ minHeight: "100vh", background: "#0a0f2c" }}><CosmeticsStore /></div>
    ) : (
      <div style={{ padding: 24 }}>Coming soon. <Link to="/">Back</Link></div>
    ),
});
