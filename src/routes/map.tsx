import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Background, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MAP_TREE, layoutTree, type MapNode } from "@/lib/youcog/map-data";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "Map · Youcognito" }] }),
  component: MapPage,
});

function Box({ data }: NodeProps<Node<{ n: MapNode; root: boolean }>>) {
  const { n, root } = data;
  const ext = n.href?.startsWith("http");
  return (
    <div className={`w-[250px] rounded-xl border px-3 py-2 text-left shadow-[0_0_14px_rgba(124,58,237,0.3)] ${root ? "border-violet-300 bg-violet-700" : "border-violet-400/50 bg-[#2e1065]"}`}>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <p className="font-display text-base text-white">{root ? "👻 " : ""}{n.title}{n.href ? <span className="ml-1 text-violet-300">{ext ? "↗" : "→"}</span> : null}</p>
      {n.text ? <p className="mt-0.5 break-words text-xs leading-snug text-violet-100/80">{n.text}</p> : null}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}
const nodeTypes = { box: Box };

function MapPage() {
  const { nodes, edges } = useMemo(() => {
    const placed = layoutTree(MAP_TREE);
    const nodes: Node[] = placed.map((p) => ({ id: p.id, type: "box", position: { x: p.x, y: p.y }, data: { n: p.node, root: p.id === "root" } }));
    const edges: Edge[] = placed.filter((p) => p.parent).map((p) => ({ id: `${p.parent}-${p.id}`, source: p.parent!, target: p.id, type: "smoothstep", style: { stroke: "#a78bfa", strokeWidth: 1.5 } }));
    return { nodes, edges };
  }, []);
  return (
    <main className="flex h-dvh flex-col bg-canvas text-ink" data-testid="map-page">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div><p className="font-display text-xl">👻 Youcognito map</p><p className="text-xs text-mist">Pinch or scroll to zoom · tap a box to open it</p></div>
        <Link to="/" className="press rounded-seal border border-line px-3 py-2 text-sm">App</Link>
      </header>
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="dark" fitView minZoom={0.1} maxZoom={2}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false} nodesFocusable={false}
          onNodeClick={(_, n) => { const h = (n.data as { n: MapNode }).n.href; if (!h) return; if (h.startsWith("http")) window.open(h, "_blank", "noopener"); else location.href = h; }}
          style={{ background: "transparent" }}
        >
          <Background color="#4c1d95" gap={28} />
          <MiniMap pannable zoomable nodeColor="#7c3aed" maskColor="rgba(20,8,31,0.7)" className="!hidden sm:!block" />
        </ReactFlow>
      </div>
      <p className="px-4 py-2 text-center text-[11px] text-faint">Not investment advice.</p>
    </main>
  );
}
