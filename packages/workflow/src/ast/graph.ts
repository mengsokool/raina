import { VALID_TRIGGER_KINDS, VALID_ACTION_KINDS, VALID_CONDITION_KINDS } from "../blocks/kinds";
import type { AutomationGraph, GraphNode, GraphEdge } from "./types";

export function buildLinearGraph(
  triggerKind: string | undefined,
  triggerConfig: Record<string, unknown>,
  actions: unknown[]
): AutomationGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (triggerKind && VALID_TRIGGER_KINDS.has(triggerKind)) {
    nodes.push({ id: "trigger", kind: triggerKind, config: triggerConfig ?? {} });
  }

  let prev: string | null = nodes.length ? "trigger" : null;
  let i = 0;
  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const { type, ...config } = raw as Record<string, unknown> & { type?: unknown };
    if (typeof type !== "string" || !VALID_ACTION_KINDS.has(type)) continue;
    const id = `a${i++}`;
    nodes.push({ id, kind: type, config });
    if (prev) edges.push({ from: prev, to: id, port: "out" });
    prev = id;
  }

  return { nodes, edges };
}

export function isGraph(v: unknown): v is AutomationGraph {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as AutomationGraph).nodes) &&
    Array.isArray((v as AutomationGraph).edges)
  );
}

export function triggerNodes(graph: AutomationGraph): GraphNode[] {
  return graph.nodes.filter((n) => VALID_TRIGGER_KINDS.has(n.kind));
}

export function actionNodes(graph: AutomationGraph): GraphNode[] {
  return graph.nodes.filter((n) => VALID_ACTION_KINDS.has(n.kind));
}

export function countActionNodes(graph: AutomationGraph): number {
  return actionNodes(graph).length;
}

export function entryNode(graph: AutomationGraph): GraphNode | undefined {
  return graph.nodes[0];
}

export function nodesById(graph: AutomationGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

export function outgoingEdges(graph: AutomationGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((e) => e.from === nodeId);
}

export function serializeTriggerKinds(graph: AutomationGraph): string {
  const kinds = [...new Set(triggerNodes(graph).map((n) => n.kind))];
  return kinds.length ? `,${kinds.join(",")},` : "";
}

export function hasCycle(graph: AutomationGraph): boolean {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }

  const visiting = new Set<string>();
  const done = new Set<string>();

  const dfs = (id: string): boolean => {
    visiting.add(id);
    for (const to of adj.get(id) ?? []) {
      if (visiting.has(to)) return true;
      if (!done.has(to) && dfs(to)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  };

  for (const n of graph.nodes) {
    if (!done.has(n.id) && dfs(n.id)) return true;
  }
  return false;
}

export function graphError(graph: AutomationGraph): string | null {
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const n of graph.nodes) {
    if (
      !VALID_TRIGGER_KINDS.has(n.kind) &&
      !VALID_ACTION_KINDS.has(n.kind) &&
      !VALID_CONDITION_KINDS.has(n.kind)
    ) {
      return `Unknown block kind: ${n.kind}`;
    }
  }
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) return "An edge references a missing node.";
  }
  if (hasCycle(graph)) return "Connections must not form a loop.";
  return null;
}

/**
 * Returns nodes in topological order (Kahn's algorithm)
 */
export function topologicalSort(graph: AutomationGraph): GraphNode[] {
  const nodeMap = nodesById(graph);
  const inDegree = new Map<string, number>();

  for (const n of graph.nodes) {
    inDegree.set(n.id, 0);
  }
  for (const e of graph.edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const result: GraphNode[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = nodeMap.get(currentId);
    if (node) result.push(node);

    for (const edge of outgoingEdges(graph, currentId)) {
      const nextDeg = (inDegree.get(edge.to) ?? 0) - 1;
      inDegree.set(edge.to, nextDeg);
      if (nextDeg === 0) {
        queue.push(edge.to);
      }
    }
  }

  return result;
}
