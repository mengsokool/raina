import { describe, it, expect } from "vitest";
import {
  hasCycle,
  topologicalSort,
  buildLinearGraph,
  evaluateCondition,
  matchTimeWindow,
  unsafeUrlReason,
  TRIGGER_CATALOG,
  ACTION_CATALOG,
  BLOCK_CATALOG,
  blockLines,
  findBlock,
} from "../index";

describe("@raina/workflow Core Engine", () => {
  it("has valid trigger and action catalogs loaded", () => {
    expect(TRIGGER_CATALOG.length).toBeGreaterThan(0);
    expect(ACTION_CATALOG.length).toBeGreaterThan(0);
  });

  it("resolves each block through the registry and its own summary definition", () => {
    for (const block of BLOCK_CATALOG) {
      expect(findBlock(block.kind)).toBe(block);
      expect(block.summarize).toBeTypeOf("function");
      expect(blockLines(block.kind, {})).toEqual(expect.any(Array));
    }
  });

  it("builds a linear graph correctly", () => {
    const graph = buildLinearGraph(
      "variable",
      { variable: "temp", operator: ">", value: 30 },
      [{ type: "set_variable", variable: "relay", value: "1" }]
    );
    expect(graph.nodes.length).toBe(2);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].from).toBe("trigger");
    expect(graph.edges[0].to).toBe("a0");
  });

  it("detects DAG cycles correctly", () => {
    const cyclicGraph = {
      nodes: [{ id: "n1", kind: "manual", config: {} }, { id: "n2", kind: "delay", config: {} }],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n1" },
      ],
    };
    expect(hasCycle(cyclicGraph)).toBe(true);

    const acyclicGraph = {
      nodes: [{ id: "n1", kind: "manual", config: {} }, { id: "n2", kind: "delay", config: {} }],
      edges: [{ from: "n1", to: "n2" }],
    };
    expect(hasCycle(acyclicGraph)).toBe(false);
  });

  it("orders nodes in topological sequence", () => {
    const graph = {
      nodes: [
        { id: "c", kind: "delay", config: {} },
        { id: "a", kind: "manual", config: {} },
        { id: "b", kind: "delay", config: {} },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };
    const sorted = topologicalSort(graph);
    expect(sorted.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("evaluates condition comparisons correctly", () => {
    expect(evaluateCondition(35, ">", 30)).toBe(true);
    expect(evaluateCondition(25, ">", 30)).toBe(false);
    expect(evaluateCondition("active", "==", "active")).toBe(true);
    expect(evaluateCondition("online", "!=", "offline")).toBe(true);
    expect(evaluateCondition(10, "changed", 10, 5)).toBe(true);
    expect(evaluateCondition(10, "changed", 10, 10)).toBe(false);
  });

  it("evaluates time windows accurately", () => {
    const date1200 = new Date("2026-09-18T12:00:00");
    expect(matchTimeWindow(date1200, { from: "09:00", to: "17:00" })).toBe(true);
    expect(matchTimeWindow(date1200, { from: "18:00", to: "22:00" })).toBe(false);
  });

  it("guards against internal and private network SSRF targets", () => {
    expect(unsafeUrlReason("http://localhost:8080")).toBe("url targets an internal host");
    expect(unsafeUrlReason("http://127.0.0.1:3000")).toBe("url targets an internal host");
    expect(unsafeUrlReason("http://169.254.169.254/latest/meta-data")).toBe("url targets an internal host");
    expect(unsafeUrlReason("https://hooks.slack.com/services/test")).toBe(null);
    expect(unsafeUrlReason("https://discord.com/api/webhooks/test")).toBe(null);
  });
});
