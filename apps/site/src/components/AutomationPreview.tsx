import { useEffect, useState } from "react";
import {
  MarkerType,
  ReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BlockNode,
  type FlowNode,
} from "../../../web/src/routes/automations/canvas/BlockNode";

const nodeTypes = { block: BlockNode };

const edges: Edge[] = [
  {
    id: "temperature-to-fan",
    source: "temperature",
    sourceHandle: "out",
    target: "set-fan",
    targetHandle: "in",
    type: "smoothstep",
    style: { stroke: "#4d7c0f", strokeWidth: 2.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#4d7c0f" },
  },
];

function exampleNodes(stacked: boolean): FlowNode[] {
  return [
    {
      id: "temperature",
      type: "block",
      position: { x: 0, y: 0 },
      data: {
        kind: "variable",
        config: { variable: "humidity", operator: ">", value: 70 },
      },
    },
    {
      id: "set-fan",
      type: "block",
      position: stacked ? { x: 0, y: 105 } : { x: 315, y: 0 },
      data: {
        kind: "set_variable",
        config: { variable: "alert", value: "on" },
      },
    },
  ];
}

export function AutomationPreview() {
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setStacked(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div
      className="site-automation-preview"
      role="img"
      aria-label="Raina automation blocks: when humidity is above 70, set alert to on"
    >
          <ReactFlow
            key={stacked ? "stacked" : "wide"}
            nodes={exampleNodes(stacked)}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: stacked ? 0.1 : 0.14, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            minZoom={0.5}
            maxZoom={1}
          />
    </div>
  );
}
