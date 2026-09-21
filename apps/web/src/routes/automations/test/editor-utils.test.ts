import { describe, it, expect } from "vitest";
import {
  validateBlockConfig,
  validateAllBlocks,
} from "../utils/types";
import {
  toFlow,
  toGraph,
  reaches,
  defaultConfig,
} from "../utils/graph-utils";

describe("Automation Editor Logic & Graph Utils", () => {
  it("generates default config correctly for blocks", () => {
    const varCfg = defaultConfig("variable");
    expect(varCfg).toMatchObject({
      operator: ">",
      cooldown_seconds: 0,
    });

    const schedCfg = defaultConfig("schedule");
    expect(schedCfg).toMatchObject({
      time: "08:00",
    });
  });

  it("validates required fields and formats", () => {
    // Missing required field 'variable'
    const errors1 = validateBlockConfig("variable", {});
    expect(errors1.variable).toBeDefined();

    // Invalid time format for schedule
    const errors2 = validateBlockConfig("schedule", { time: "invalid-time" });
    expect(errors2.time).toBeDefined();

    // Valid schedule
    const errors3 = validateBlockConfig("schedule", { time: "14:30" });
    expect(errors3.time).toBeUndefined();

    // Number validation
    const errors4 = validateBlockConfig("variable", {
      variable: "temp",
      cooldown_seconds: "not-a-number",
    });
    expect(errors4.cooldown_seconds).toBeDefined();
  });

  it("validates all blocks across a node collection", () => {
    const nodes = [
      { id: "node1", data: { kind: "variable", config: {} } },
      { id: "node2", data: { kind: "manual", config: {} } },
    ];
    const errorsMap = validateAllBlocks(nodes);
    expect(errorsMap.has("node1")).toBe(true);
    expect(errorsMap.has("node2")).toBe(false); // manual has no required fields
  });

  it("converts between Flow format and Graph model correctly", () => {
    const graph = {
      nodes: [
        { id: "n1", kind: "manual", config: {}, x: 100, y: 100 },
        { id: "n2", kind: "emit_event", config: { event: "test" }, x: 300, y: 100 },
      ],
      edges: [{ from: "n1", to: "n2", port: "out" }],
    };

    const flow = toFlow(graph);
    expect(flow.nodes.length).toBe(2);
    expect(flow.edges.length).toBe(1);
    expect(flow.edges[0].source).toBe("n1");
    expect(flow.edges[0].target).toBe("n2");

    const backToGraph = toGraph(flow.nodes, flow.edges);
    expect(backToGraph.nodes.length).toBe(2);
    expect(backToGraph.edges.length).toBe(1);
    expect(backToGraph.edges[0]).toEqual({ from: "n1", to: "n2", port: "out" });
  });

  it("detects cycle / loops in connections", () => {
    const edges = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ] as any;

    // Direct reachability
    expect(reaches(edges, "A", "C")).toBe(true);
    // Reverse should be false
    expect(reaches(edges, "C", "A")).toBe(false);

    // If we connect C -> A, it would reach A from C, causing a loop!
    expect(reaches(edges, "C", "A")).toBe(false); // current state
    expect(reaches([...edges, { source: "C", target: "A" }], "C", "A")).toBe(true);
  });
});
