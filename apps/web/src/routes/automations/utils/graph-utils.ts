import { GraphNode, GraphEdge, blocks } from "@raina/workflow";
import { FlowNode } from "../canvas/BlockNode";
import { Edge } from "@xyflow/react";
import { validateBlockConfig } from "./types";

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const edgeId = (edge: GraphEdge) => `edge:${edge.from}:${edge.port ?? "out"}:${edge.to}`;

export function toFlow(graph: Graph): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: (graph.nodes || []).map((node, index) => {
      const errors = validateBlockConfig(node.kind, node.config ?? {});
      return {
        id: node.id,
        type: "block",
        position: {
          x: typeof node.x === "number" ? node.x : 80 + index * 260,
          y: typeof node.y === "number" ? node.y : 80 + (index % 3) * 140,
        },
        data: {
          kind: node.kind,
          config: { ...(node.config || {}) },
          errors: Object.keys(errors).length > 0 ? errors : undefined,
        },
      };
    }),
    edges: (graph.edges || []).map((edge) => {
      const port = edge.port ?? "out";
      const isNamedPort = port !== "out";
      return {
        id: edgeId(edge),
        source: edge.from,
        target: edge.to,
        sourceHandle: port,
        type: "workflow",
        label: isNamedPort ? port : undefined,
      };
    }),
  };
}

export function toGraph(nodes: FlowNode[], edges: Edge[]): Graph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      config: node.data.config,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    })),
    edges: edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      port: edge.sourceHandle ?? "out",
    })),
  };
}

/**
 * Checks if reaching target from 'from' node is possible (Cycle detection).
 */
export function reaches(edges: Edge[], from: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.source === current) {
        stack.push(edge.target);
      }
    }
  }
  return false;
}

export const defaultConfig = (kind: string): Record<string, unknown> => {
  const manifest = blocks.findBlock(kind);
  if (!manifest) return {};
  const config: Record<string, unknown> = {};
  for (const field of manifest.fields) {
    if (field.default !== undefined) {
      config[field.key] = field.default;
    }
  }
  return config;
};
