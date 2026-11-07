import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryModuleService } from "../modules/telemetry/telemetry.service";
import { prisma } from "@raina/db";
import { getOrCreateDefaultDevice } from "../services/telemetry.service";
import { publishDeviceCommand } from "../lib/device-transport";

vi.mock("@raina/db", () => ({ prisma: {
  projectVariable: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({}) },
  telemetry: { create: vi.fn().mockResolvedValue({}) },
} }));
vi.mock("../services/telemetry.service", () => ({ getOrCreateDefaultDevice: vi.fn().mockResolvedValue("resolved-device"), processTelemetryPayload: vi.fn() }));
vi.mock("../lib/device-transport", () => ({ publishDeviceCommand: vi.fn() }));
vi.mock("../lib/events", () => ({ broadcastControl: vi.fn() }));
vi.mock("../lib/automation-queue", () => ({ enqueueAutomationEvaluation: vi.fn().mockResolvedValue(undefined) }));

describe("dashboard command device routing", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses the variable's registered device when the dashboard omits deviceId", async () => {
    vi.mocked(prisma.projectVariable.findUnique).mockResolvedValue({ deviceId: "registered-board" } as any);
    await new TelemetryModuleService().executeControl({ projectId: "project", variable: "fff", value: "on" });
    expect(getOrCreateDefaultDevice).toHaveBeenCalledWith("project", "registered-board");
    expect(publishDeviceCommand).toHaveBeenCalledWith("project", "resolved-device", { fff: "on" });
  });
  it("honors an explicit device instead of the existing variable binding", async () => {
    await new TelemetryModuleService().executeControl({ projectId: "project", deviceId: "explicit-board", variable: "fff", value: "off" });
    expect(prisma.projectVariable.findUnique).not.toHaveBeenCalled();
    expect(getOrCreateDefaultDevice).toHaveBeenCalledWith("project", "explicit-board");
  });
  it("uses the existing default behavior for variables without a binding", async () => {
    vi.mocked(prisma.projectVariable.findUnique).mockResolvedValue(null);
    await new TelemetryModuleService().executeControl({ projectId: "project", variable: "fff", value: "on" });
    expect(getOrCreateDefaultDevice).toHaveBeenCalledWith("project", undefined);
  });
});
