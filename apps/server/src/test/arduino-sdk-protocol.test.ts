import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../index";
import { prisma } from "@raina/db";
import { processTelemetryPayload } from "../services/telemetry.service";
import { publishDeviceCommand } from "../lib/emqx";

vi.mock("@raina/db", () => ({
  prisma: {
    projectToken: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    device: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    projectVariable: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    telemetry: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    projectMember: {
      findUnique: vi.fn(),
    },
    dashboardAccess: {
      findUnique: vi.fn(),
    },
    automation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../lib/emqx", () => ({
  initEmqx: vi.fn(),
  closeEmqx: vi.fn(),
  publishDeviceCommand: vi.fn(),
  getEmqxStatus: vi.fn().mockReturnValue({ connected: true, url: "mqtt://127.0.0.1:1883" }),
}));

describe("Arduino SDK Protocol Contract Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Telemetry Payload Compatibility", () => {
    it("processes multi-metric telemetry published by Raina.send('temp', 28.5, 'hum', 65.0)", async () => {
      // Mock existing device
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "esp32_greenhouse_01",
        projectId: "proj_farm_01",
        deviceKey: "esp32_greenhouse_01",
      });

      // Emulate what Raina.send("temperature", 28.5, "humidity", 65.0) sends over MQTT:
      // Topic: v1/proj_farm_01/devices/esp32_greenhouse_01/telemetry
      const sdkPayload = {
        temperature: 28.5,
        humidity: 65.0,
      };

      const result = await processTelemetryPayload({
        projectId: "proj_farm_01",
        deviceId: "esp32_greenhouse_01",
        metrics: sdkPayload,
      });

      expect(result.deviceId).toBe("esp32_greenhouse_01");
      expect(result.processed).toHaveLength(2);
      expect(result.processed).toEqual(
        expect.arrayContaining([
          { key: "temperature", value: 28.5 },
          { key: "humidity", value: 65.0 },
        ])
      );

      // Verify batch insert into DB
      expect(prisma.telemetry.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.projectVariable.upsert).toHaveBeenCalledTimes(2);
    });

    it("throttles DB writes for device lastSeen to prevent high frequency write contention", async () => {
      const { shouldUpdateDeviceLastSeen, resetDeviceLastSeenThrottle } = await import("../services/telemetry.service");
      resetDeviceLastSeenThrottle();

      const t0 = 1000000;
      // First call -> should update DB
      expect(shouldUpdateDeviceLastSeen("dev_1", t0)).toBe(true);
      // Immediate next call 1s later -> throttled (false)
      expect(shouldUpdateDeviceLastSeen("dev_1", t0 + 1000)).toBe(false);
      // 29s later -> still throttled
      expect(shouldUpdateDeviceLastSeen("dev_1", t0 + 29000)).toBe(false);
      // 31s later -> should update DB again
      expect(shouldUpdateDeviceLastSeen("dev_1", t0 + 31000)).toBe(true);
    });
  });

  describe("Actuator Downlink Command Compatibility", () => {
    it("verifies server envelopes command into format readable by RAINA_ON", async () => {
      // Setup authenticated staff session
      (prisma.session.findUnique as any).mockResolvedValue({
        id: "sess_admin",
        userId: "usr_admin",
        expiresAt: BigInt(Date.now() + 3600000),
        user: { id: "usr_admin", role: "admin", status: "active" },
      });
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "esp32_greenhouse_01",
        projectId: "proj_farm_01",
      });

      // User toggles pump switch on web dashboard
      const res = await app.request("/v1/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": "sess_admin",
        },
        body: JSON.stringify({
          projectId: "proj_farm_01",
          deviceId: "esp32_greenhouse_01",
          variable: "pump_relay",
          value: 1,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify server calls publishDeviceCommand with the exact variable key and value
      expect(publishDeviceCommand).toHaveBeenCalledWith(
        "proj_farm_01",
        "esp32_greenhouse_01",
        { pump_relay: 1 }
      );
    });

    it("envelopes color commands for RGB/NeoPixel actuators readable by value.asColor()", async () => {
      (prisma.session.findUnique as any).mockResolvedValue({
        id: "sess_admin",
        userId: "usr_admin",
        expiresAt: BigInt(Date.now() + 3600000),
        user: { id: "usr_admin", role: "admin", status: "active" },
      });
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "esp32_greenhouse_01",
        projectId: "proj_farm_01",
      });

      const res = await app.request("/v1/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": "sess_admin",
        },
        body: JSON.stringify({
          projectId: "proj_farm_01",
          deviceId: "esp32_greenhouse_01",
          variable: "rgb_strip",
          value: "#00FF80",
        }),
      });

      expect(res.status).toBe(200);
      expect(publishDeviceCommand).toHaveBeenCalledWith(
        "proj_farm_01",
        "esp32_greenhouse_01",
        { rgb_strip: "#00FF80" }
      );
    });
  });
});
