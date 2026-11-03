import { createFileRoute, Link } from "@tanstack/react-router";
import { GhostLab } from "@/components/youcog/ghost-lab";
import { ghostLabEnabled } from "@/lib/youcog/ghost-lab";

export const Route = createFileRoute("/lab")({
  head: () => ({ meta: [{ title: "Ghost Lab" }, { name: "robots", content: "noindex" }] }),
  component: () =>
    ghostLabEnabled() ? (
      <div style={{ minHeight: "100vh", background: "#0a0f2c" }}><GhostLab /></div>
    ) : (
      <div style={{ padding: 24 }}>Coming soon. <Link to="/">Back</Link></div>
    ),
});
