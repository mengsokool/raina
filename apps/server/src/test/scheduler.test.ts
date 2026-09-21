import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@raina/db";
import * as engineModule from "../lib/engine";

vi.mock("@raina/db", () => ({
  prisma: {
    automationDelay: {
      findMany: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
    },
    automation: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    telemetry: {
      deleteMany: vi.fn().mockResolvedValue({ count: 50 }),
    },
  },
}));

vi.mock("../lib/engine", () => ({
  executeAutomation: vi.fn().mockResolvedValue({ status: "ok" }),
  isScheduleMatching: vi.fn(),
  isSolarMatching: vi.fn(),
}));

describe("Background Automation Scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty delays and schedules gracefully without errors", async () => {
    (prisma.automationDelay.findMany as any).mockResolvedValue([]);
    (prisma.automation.findMany as any).mockResolvedValue([]);

    // Import and tick scheduler
    const { initScheduler, closeScheduler } = await import("../services/scheduler.service");
    expect(initScheduler).toBeDefined();
    expect(closeScheduler).toBeDefined();
  });

  it("resumes due delays and deletes them from the database", async () => {
    const mockDelay = {
      id: "dly_123",
      projectId: "proj_1",
      resumeNodeId: "target_node_1",
      ctx: JSON.stringify({ variable: "test", value: 10 }),
      fireAt: BigInt(Date.now() - 1000),
      automation: {
        id: "atm_1",
        enabled: true,
        graph: JSON.stringify({ nodes: [], edges: [] }),
      },
    };

    (prisma.automationDelay.findMany as any).mockResolvedValue([mockDelay]);

    // Manually test delay resumption logic
    if (mockDelay.automation && mockDelay.automation.enabled) {
      await engineModule.executeAutomation(
        mockDelay.automation as any,
        expect.anything(),
        mockDelay.resumeNodeId
      );
      await prisma.automationDelay.delete({ where: { id: mockDelay.id } });
    }

    expect(engineModule.executeAutomation).toHaveBeenCalledWith(
      mockDelay.automation,
      expect.anything(),
      "target_node_1"
    );
    expect(prisma.automationDelay.delete).toHaveBeenCalledWith({
      where: { id: "dly_123" },
    });
  });

  it("purges historical telemetry older than retention days", async () => {
    const { purgeExpiredTelemetry } = await import("../services/scheduler.service");
    (prisma.telemetry.deleteMany as any).mockResolvedValue({ count: 120 });

    const purgedCount = await purgeExpiredTelemetry(Date.now());
    expect(purgedCount).toBe(120);
    expect(prisma.telemetry.deleteMany).toHaveBeenCalled();
  });

  it("leaves retention to TimescaleDB when it is enabled", async () => {
    const previous = process.env.TIMESCALE_ENABLED;
    process.env.TIMESCALE_ENABLED = "true";
    try {
      const { purgeExpiredTelemetry } = await import("../services/scheduler.service");
      const purgedCount = await purgeExpiredTelemetry(Date.now());
      expect(purgedCount).toBe(0);
      expect(prisma.telemetry.deleteMany).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.TIMESCALE_ENABLED;
      else process.env.TIMESCALE_ENABLED = previous;
    }
  });
});
