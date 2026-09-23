import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@raina/db", () => {
  const store = new Map<string, any>();
  return {
    prisma: {
      device: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      projectVariable: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      telemetry: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      projectToken: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      session: {
        findUnique: vi.fn(),
      },
    },
  };
});

import { prisma } from "@raina/db";
import { processTelemetryPayload } from "../services/telemetry.service";
import { variableService } from "../modules/variables/variables.service";

describe("Project-Level Variables & De-duplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters out reserved keys (ts, timestamp, time) from becoming variables", async () => {
    (prisma.device.findFirst as any).mockResolvedValue({
      id: "dev_123",
      projectId: "proj_test",
      tokenId: "tok_1",
    });

    (prisma.projectVariable.upsert as any).mockResolvedValue({
      id: "var_proj_test_temperature",
      projectId: "proj_test",
      key: "temperature",
      value: "25.4",
    });

    await processTelemetryPayload({
      projectId: "proj_test",
      deviceId: "dev_123",
      tokenId: "tok_1",
      metrics: {
        ts: 1789708105177,
        timestamp: 1789708105177,
        time: 1789708105177,
        temperature: 25.4,
      },
    });

    // Only 'temperature' should be upserted to projectVariable
    expect(prisma.projectVariable.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.projectVariable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_key: {
            projectId: "proj_test",
            key: "temperature",
          },
        },
      })
    );
  });

  it("upserts project-level variables using projectId_key composite unique key", async () => {
    (prisma.device.findFirst as any).mockResolvedValue({
      id: "dev_01",
      projectId: "proj_test",
      tokenId: "tok_1",
    });

    (prisma.projectVariable.upsert as any).mockResolvedValue({
      id: "var_proj_test_humidity",
      projectId: "proj_test",
      key: "humidity",
      value: "60",
    });

    await processTelemetryPayload({
      projectId: "proj_test",
      deviceId: "dev_01",
      tokenId: "tok_1",
      metrics: {
        humidity: 60,
      },
    });

    expect(prisma.projectVariable.upsert).toHaveBeenCalledWith({
      where: {
        projectId_key: {
          projectId: "proj_test",
          key: "humidity",
        },
      },
      update: {
        deviceId: "dev_01",
        value: "60",
        updatedAt: expect.any(BigInt),
        lastSeen: expect.any(BigInt),
      },
      create: {
        id: "var_proj_test_humidity",
        projectId: "proj_test",
        deviceId: "dev_01",
        key: "humidity",
        value: "60",
        createdAt: expect.any(BigInt),
        updatedAt: expect.any(BigInt),
        lastSeen: expect.any(BigInt),
      },
    });
  });

  it("creates a variable scoped to project", async () => {
    (prisma.device.findFirst as any).mockResolvedValue({
      id: "dev_default",
      projectId: "proj_test",
      isDefault: true,
    });

    (prisma.projectVariable.upsert as any).mockResolvedValue({
      id: "var_proj_test_temp_limit",
      projectId: "proj_test",
      key: "temp_limit",
      unit: "°C",
      value: "30",
    });

    const result = await variableService.createVariable("proj_test", {
      key: "temp_limit",
      unit: "°C",
      defaultValue: "30",
    });

    expect(prisma.projectVariable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_key: {
            projectId: "proj_test",
            key: "temp_limit",
          },
        },
      })
    );
    expect(result.key).toBe("temp_limit");
  });
});
