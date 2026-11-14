import { createFileRoute } from "@tanstack/react-router";
import { GhostLab } from "@/components/youcog/ghost-lab";

export const Route = createFileRoute("/lab")({
  head: () => ({ meta: [{ title: "Ghost Lab" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <div style={{ minHeight: "100vh", background: "#0a0f2c" }}><GhostLab /></div>
  ),
});
