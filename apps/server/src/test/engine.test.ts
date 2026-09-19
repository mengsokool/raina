import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateOperator,
  isScheduleMatching,
  isSolarMatching,
  executeAutomation,
} from "../lib/engine";
import { prisma } from "@raina/db";
import * as emqxModule from "../lib/emqx";
import * as eventsModule from "../lib/events";

// Mock database and external modules
vi.mock("@raina/db", () => ({
  prisma: {
    automation: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
    },
    projectVariable: {
      findFirst: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
    device: {
      findFirst: vi.fn().mockResolvedValue({ id: "dev_default" }),
    },
    integration: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    automationDelay: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
    },
    automationRun: {
      create: vi.fn().mockResolvedValue({ id: "run_test" }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    automationStepRun: {
      create: vi.fn().mockResolvedValue({ id: "step_test" }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../lib/emqx", () => ({
  publishDeviceCommand: vi.fn(),
}));

vi.mock("../lib/events", () => ({
  broadcastEvent: vi.fn(),
  broadcastTelemetry: vi.fn(),
}));

describe("Automation Engine - Operator Evaluation", () => {
  it("evaluates numeric comparisons correctly", () => {
    expect(evaluateOperator(35, ">", 30)).toBe(true);
    expect(evaluateOperator(30, ">", 30)).toBe(false);
    expect(evaluateOperator(25, "<", 30)).toBe(true);
    expect(evaluateOperator(30, ">=", 30)).toBe(true);
    expect(evaluateOperator(29.9, ">=", 30)).toBe(false);
    expect(evaluateOperator(30, "<=", 30)).toBe(true);
    expect(evaluateOperator(30.1, "<=", 30)).toBe(false);
    expect(evaluateOperator(100, "==", 100)).toBe(true);
    expect(evaluateOperator(100, "!=", 100)).toBe(false);
    expect(evaluateOperator(100, "!=", 50)).toBe(true);
  });

  it("evaluates string comparisons and case insensitivity", () => {
    expect(evaluateOperator("ON", "==", "on")).toBe(true);
    expect(evaluateOperator(" active ", "==", "active")).toBe(true);
    expect(evaluateOperator("idle", "!=", "active")).toBe(true);
    expect(evaluateOperator("auto", "==", "manual")).toBe(false);
  });

  it("handles '=' operator alias and boolean truthy values", () => {
    expect(evaluateOperator(1, "=", 1)).toBe(true);
    expect(evaluateOperator("1", "=", 1)).toBe(true);
    expect(evaluateOperator(true, "=", 1)).toBe(true);
    expect(evaluateOperator("true", "=", 1)).toBe(true);
    expect(evaluateOperator("on", "=", 1)).toBe(true);
    expect(evaluateOperator(0, "=", 0)).toBe(true);
    expect(evaluateOperator(false, "=", 0)).toBe(true);
    expect(evaluateOperator("off", "=", 0)).toBe(true);
    expect(evaluateOperator("0", "=", 1)).toBe(false);
  });

  it("handles 'changed' operator unconditionally", () => {
    expect(evaluateOperator(10, "changed", 0)).toBe(true);
    expect(evaluateOperator("anything", "changed", null)).toBe(true);
    expect(evaluateOperator(1, "", null)).toBe(true);
  });
});

describe("Automation Engine - Time & Schedule Matching", () => {
  it("matches schedule with current time and weekday", () => {
    const now = new Date();
    const curH = String(now.getHours()).padStart(2, "0");
    const curM = String(now.getMinutes()).padStart(2, "0");
    const curDay = now.getDay();

    const config = {
      time: `${curH}:${curM}`,
      days: [curDay],
    };

    expect(isScheduleMatching(config)).toBe(true);
  });

  it("rejects schedule on different time or day", () => {
    const now = new Date();
    const otherDay = (now.getDay() + 1) % 7;

    const diffTimeConfig = {
      time: "03:17",
      days: [],
    };
    expect(isScheduleMatching(diffTimeConfig)).toBe(false);

    const diffDayConfig = {
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      days: [otherDay],
    };
    expect(isScheduleMatching(diffDayConfig)).toBe(false);
  });
});

describe("Automation Engine - Graph Execution & Branching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes variable trigger -> if_variable condition -> branch true (set_variable)", async () => {
    const automation = {
      id: "atm_test_1",
      projectId: "proj_1",
      graph: JSON.stringify({
        nodes: [
          {
            id: "trig_1",
            kind: "variable",
            config: { variable: "temp", operator: ">", value: 30 },
          },
          {
            id: "cond_1",
            kind: "if_variable",
            config: { variable: "temp", operator: ">=", value: 50 },
          },
          {
            id: "act_high",
            kind: "set_variable",
            config: { variable: "fan_speed", value: 100 },
          },
          {
            id: "act_normal",
            kind: "set_variable",
            config: { variable: "fan_speed", value: 50 },
          },
        ],
        edges: [
          { from: "trig_1", to: "cond_1", port: "out" },
          { from: "cond_1", to: "act_high", port: "true" },
          { from: "cond_1", to: "act_normal", port: "false" },
        ],
      }),
    };

    // Scenario A: temp = 55 (Condition is true -> fan_speed = 100)
    const resultA = await executeAutomation(automation, {
      source: "telemetry",
      projectId: "proj_1",
      ts: Date.now(),
      variable: "temp",
      value: 55,
      deviceId: "dev_1",
    });

    expect(resultA.status).toBe("ok");
    expect(emqxModule.publishDeviceCommand).toHaveBeenCalledWith("proj_1", "dev_1", {
      fan_speed: 100,
    });

    vi.clearAllMocks();

    // Scenario B: temp = 35 (Trigger fires, but Condition is false -> fan_speed = 50)
    const resultB = await executeAutomation(automation, {
      source: "telemetry",
      projectId: "proj_1",
      ts: Date.now(),
      variable: "temp",
      value: 35,
      deviceId: "dev_1",
    });

    expect(resultB.status).toBe("ok");
    expect(emqxModule.publishDeviceCommand).toHaveBeenCalledWith("proj_1", "dev_1", {
      fan_speed: 50,
    });
  });

  it("handles event trigger and action emit_event with cascading", async () => {
    const automation = {
      id: "atm_event_1",
      projectId: "proj_1",
      graph: JSON.stringify({
        nodes: [
          {
            id: "n_event_trig",
            kind: "event",
            config: { event: "motion_detected" },
          },
          {
            id: "n_emit",
            kind: "emit_event",
            config: { event: "lights_on_event" },
          },
        ],
        edges: [{ from: "n_event_trig", to: "n_emit", port: "out" }],
      }),
    };

    const res = await executeAutomation(automation, {
      source: "event",
      projectId: "proj_1",
      ts: Date.now(),
      event: "motion_detected",
    });

    expect(res.status).toBe("ok");
    expect(eventsModule.broadcastEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "automation_event",
        event: "lights_on_event",
      })
    );
  });

  it("supports manual test run bypassing trigger condition checks", async () => {
    const automation = {
      id: "atm_manual_1",
      projectId: "proj_1",
      graph: JSON.stringify({
        nodes: [
          {
            id: "m_trig",
            kind: "manual",
            config: {},
          },
          {
            id: "m_set",
            kind: "set_variable",
            config: { variable: "power", value: "active" },
          },
        ],
        edges: [{ from: "m_trig", to: "m_set", port: "out" }],
      }),
    };

    const res = await executeAutomation(automation, {
      source: "manual",
      projectId: "proj_1",
      ts: Date.now(),
      isManual: true,
    });

    expect(res.status).toBe("ok");
    expect(res.stepsExecuted).toBe(2);
  });
});

describe("Automation Engine - Durable Execution & Resumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists run and step checkpoints into database", async () => {
    const automation = {
      id: "atm_durable_1",
      projectId: "proj_durable",
      graph: JSON.stringify({
        nodes: [
          { id: "trig", kind: "variable", config: { variable: "temp", operator: ">", value: 20 } },
          { id: "act_set", kind: "set_variable", config: { variable: "heater", value: "off" } },
        ],
        edges: [{ from: "trig", to: "act_set", port: "out" }],
      }),
    };

    const res = await executeAutomation(automation, {
      source: "telemetry",
      projectId: "proj_durable",
      ts: Date.now(),
      variable: "temp",
      value: 25,
      deviceId: "dev_durable",
    });

    expect(res.status).toBe("ok");
    expect(res.runId).toBeDefined();
    expect(prisma.automationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationId: "atm_durable_1",
          projectId: "proj_durable",
          status: "running",
        }),
      })
    );
    expect(prisma.automationStepRun.create).toHaveBeenCalledTimes(2);
  });

  it("performs idempotent replay without re-executing completed side-effect actions", async () => {
    const automation = {
      id: "atm_replay_1",
      projectId: "proj_replay",
      graph: JSON.stringify({
        nodes: [
          { id: "trig", kind: "variable", config: { variable: "temp", operator: ">", value: 20 } },
          { id: "step_already_done", kind: "set_variable", config: { variable: "light", value: "on" } },
          { id: "step_remaining", kind: "set_variable", config: { variable: "fan", value: "high" } },
        ],
        edges: [
          { from: "trig", to: "step_already_done", port: "out" },
          { from: "step_already_done", to: "step_remaining", port: "out" },
        ],
      }),
    };

    // Mock existing run with step_already_done completed
    vi.mocked(prisma.automationRun.findUnique).mockResolvedValueOnce({
      id: "run_existing_123",
      automationId: "atm_replay_1",
      projectId: "proj_replay",
      status: "running",
      triggerSource: "telemetry",
      triggerContext: "{}",
      error: null,
      startedAt: BigInt(Date.now() - 1000),
      finishedAt: null,
      durationMs: 0,
      steps: [
        {
          id: "step_done_1",
          runId: "run_existing_123",
          nodeId: "step_already_done",
          nodeKind: "set_variable",
          category: "action",
          status: "completed",
          input: "{}",
          output: JSON.stringify({ variable: "light", value: "on" }),
          error: null,
          retryCount: 0,
          startedAt: BigInt(Date.now() - 1000),
          finishedAt: BigInt(Date.now() - 900),
          durationMs: 100,
        },
      ],
    } as any);

    const res = await executeAutomation(
      automation,
      {
        source: "telemetry",
        projectId: "proj_replay",
        ts: Date.now(),
        variable: "temp",
        value: 30,
        deviceId: "dev_replay",
      },
      { runId: "run_existing_123" }
    );

    expect(res.status).toBe("ok");
    // Verify only the remaining step (fan = high) was executed, not light = on
    expect(emqxModule.publishDeviceCommand).toHaveBeenCalledTimes(1);
    expect(emqxModule.publishDeviceCommand).toHaveBeenCalledWith("proj_replay", "dev_replay", {
      fan: "high",
    });

    const replayedLog = res.logs.find((l) => l.nodeId === "step_already_done");
    expect(replayedLog?.detail).toBe("Replayed from checkpoint");
  });

  it("pauses long delays and links runId in automationDelay record", async () => {
    const automation = {
      id: "atm_delay_durable",
      projectId: "proj_durable",
      graph: JSON.stringify({
        nodes: [
          { id: "trig", kind: "manual", config: {} },
          { id: "dly_node", kind: "delay", config: { delay_amount: 10, delay_unit: "seconds" } },
          { id: "after_dly", kind: "set_variable", config: { variable: "relay", value: 1 } },
        ],
        edges: [
          { from: "trig", to: "dly_node", port: "out" },
          { from: "dly_node", to: "after_dly", port: "out" },
        ],
      }),
    };

    const res = await executeAutomation(
      automation,
      {
        source: "manual",
        projectId: "proj_durable",
        ts: Date.now(),
        isManual: false, // Ensure it's not fast-forwarded as manual inline
      }
    );

    expect(res.status).toBe("paused");
    expect(prisma.automationDelay.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationId: "atm_delay_durable",
          projectId: "proj_durable",
          runId: res.runId,
          resumeNodeId: "after_dly",
        }),
      })
    );
    expect(prisma.automationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: res.runId },
        data: expect.objectContaining({
          status: "paused",
        }),
      })
    );
  });

  it("evaluates variable change trigger with '=' operator and branches correctly for true and false", async () => {
    const userAutomation = {
      id: "atm_pump_control",
      projectId: "proj_user",
      graph: JSON.stringify({
        nodes: [
          {
            id: "trig_pump",
            kind: "variable",
            config: { variable: "pump_relay", operator: "changed" },
          },
          {
            id: "cond_pump_on",
            kind: "if_variable",
            config: { variable: "pump_relay", operator: "=", value: "1" },
          },
          {
            id: "act_fan_80",
            kind: "set_variable",
            config: { variable: "fan_speed", value: 80 },
          },
          {
            id: "act_fan_50",
            kind: "set_variable",
            config: { variable: "fan_speed", value: 50 },
          },
        ],
        edges: [
          { from: "trig_pump", to: "cond_pump_on", port: "out" },
          { from: "cond_pump_on", to: "act_fan_80", port: "true" },
          { from: "cond_pump_on", to: "act_fan_50", port: "false" },
        ],
      }),
    };

    // Test when pump_relay = 1 (source: control or telemetry)
    const resOn = await executeAutomation(
      userAutomation,
      {
        source: "control",
        projectId: "proj_user",
        variable: "pump_relay",
        value: 1,
        ts: Date.now(),
      }
    );

    expect(resOn.status).toBe("ok");
    expect(resOn.stepsExecuted).toBe(3); // trig + cond + act_fan_80
    expect(emqxModule.publishDeviceCommand).toHaveBeenCalledWith(
      "proj_user",
      expect.any(String),
      { fan_speed: 80 }
    );

    vi.clearAllMocks();

    // Test when pump_relay = 0
    const resOff = await executeAutomation(
      userAutomation,
      {
        source: "telemetry",
        projectId: "proj_user",
        variable: "pump_relay",
        value: 0,
        ts: Date.now(),
      }
    );

    expect(resOff.status).toBe("ok");
    expect(resOff.stepsExecuted).toBe(3); // trig + cond + act_fan_50
    expect(emqxModule.publishDeviceCommand).toHaveBeenCalledWith(
      "proj_user",
      expect.any(String),
      { fan_speed: 50 }
    );
  });
});
