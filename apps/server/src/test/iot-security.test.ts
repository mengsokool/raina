import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../index";
import { prisma } from "@raina/db";
import crypto from "crypto";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

// Mock @raina/db
vi.mock("@raina/db", () => ({
  prisma: {
    projectToken: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    device: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    projectVariable: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    telemetry: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      findFirst: vi.fn(),
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

// Mock emqx publish
vi.mock("../lib/emqx", () => ({
  initEmqx: vi.fn(),
  closeEmqx: vi.fn(),
  publishDeviceCommand: vi.fn(),
  getEmqxStatus: vi.fn().mockReturnValue({ connected: true, url: "mqtt://127.0.0.1:1883" }),
}));

describe("IoT Layer Security: EMQX Broker Webhooks", () => {
  const SERVER_PASS = process.env.EMQX_SERVER_PASSWORD || "raina-internal-broker-secret";
  const VALID_TOKEN = "ptk_valid_device_secret_123456789";
  const VALID_TOKEN_HASH = sha256(VALID_TOKEN);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("EMQX Authentication Webhook (/v1/emqx/auth)", () => {
    it("VULN-IOT-01 Fix: Rejects clientid starting with raina-server- if password is missing", async () => {
      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "raina-server-spoofed-attacker",
          username: "attacker",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("deny");
      expect(data.is_superuser).toBeUndefined();
    });

    it("VULN-IOT-01 Fix: Rejects clientid starting with raina-server- if password is wrong", async () => {
      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "raina-server-spoofed-attacker",
          username: "raina-server",
          password: "wrong-password",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("Allows legitimate internal raina-server with correct server password as superuser", async () => {
      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "raina-server-worker1",
          username: "raina-server",
          password: SERVER_PASS,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("allow");
      expect(data.is_superuser).toBe(true);
    });

    it("Rejects device connection with missing password", async () => {
      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-greenhouse",
          username: "prj_test",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("Rejects device connection with invalid or non-existent token", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue(null);

      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-greenhouse",
          username: "prj_test",
          password: "invalid-token",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("Rejects device connection if project token is revoked", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_1",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: BigInt(Date.now() - 1000),
      });

      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-greenhouse",
          username: "prj_test",
          password: VALID_TOKEN,
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("Allows device connection with valid token and safely auto-registers device with collision-free ID", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_valid",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: null,
      });
      (prisma.device.findUnique as any).mockResolvedValue(null);
      (prisma.device.create as any).mockResolvedValue({
        id: "dev_safe_id_123",
      });

      const res = await app.request("/v1/emqx/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-sensor-1",
          username: "prj_test",
          password: VALID_TOKEN,
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("allow");
      expect(data.is_superuser).toBe(false);
      expect(prisma.device.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: "prj_test",
            tokenId: "tok_valid",
            deviceKey: "esp32-sensor-1",
          }),
        })
      );
    });
  });

  describe("EMQX Authorization Webhook (/v1/emqx/acl)", () => {
    it("Allows verified internal server client to publish/subscribe anything", async () => {
      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "raina-server-worker",
          username: "raina-server",
          topic: "v1/prj_any/devices/dev_any/commands",
          action: "publish",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("allow");
    });

    it("VULN-IOT-02 Fix: Denies wildcard subscription (+ or #) for devices", async () => {
      // Attacker trying to sniff all commands in project
      const res1 = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-dev1",
          username: "prj_test",
          topic: "v1/prj_test/devices/+/commands",
          action: "subscribe",
        }),
      });
      expect((await res1.json()).result).toBe("deny");

      // Attacker trying to sniff everything in broker
      const res2 = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-dev1",
          username: "prj_test",
          topic: "#",
          action: "subscribe",
        }),
      });
      expect((await res2.json()).result).toBe("deny");
    });

    it("VULN-IOT-02 Fix: Denies cross-device telemetry spoofing within the same project", async () => {
      // esp32-attacker tries to publish telemetry posing as esp32-victim
      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-attacker",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-victim/telemetry",
          action: "publish",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("VULN-IOT-02 Fix: Denies cross-device command eavesdropping", async () => {
      // esp32-attacker tries to subscribe to esp32-victim's commands
      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-attacker",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-victim/commands",
          action: "subscribe",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("VULN-IOT-02 Fix: Denies devices publishing to downlink command topics", async () => {
      // Rogue device attempting to forge command downlink
      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-dev1",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-dev1/commands",
          action: "publish",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("Allows device to publish to its OWN telemetry topic", async () => {
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "esp32-dev1",
        deviceKey: "esp32-dev1",
        projectId: "prj_test",
        token: { id: "tok_1", revokedAt: null },
      });

      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-dev1",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-dev1/telemetry",
          action: "publish",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("allow");
    });

    it("Allows device to subscribe to its OWN commands topic", async () => {
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "esp32-dev1",
        deviceKey: "esp32-dev1",
        projectId: "prj_test",
        token: { id: "tok_1", revokedAt: null },
      });

      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-dev1",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-dev1/commands",
          action: "subscribe",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("allow");
    });

    it("Lifecycle Test: Denies publish if device was deleted/forgotten from database", async () => {
      (prisma.device.findFirst as any).mockResolvedValue(null);

      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-deleted",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-deleted/telemetry",
          action: "publish",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });

    it("Lifecycle Test: Denies publish if device token was revoked", async () => {
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "esp32-dev1",
        deviceKey: "esp32-dev1",
        projectId: "prj_test",
        token: { id: "tok_1", revokedAt: BigInt(Date.now() - 5000) },
      });

      const res = await app.request("/v1/emqx/acl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientid: "esp32-dev1",
          username: "prj_test",
          topic: "v1/prj_test/devices/esp32-dev1/telemetry",
          action: "publish",
        }),
      });

      const data = await res.json();
      expect(data.result).toBe("deny");
    });
  });
});

describe("IoT Layer Security: HTTP Telemetry Ingestion & Control", () => {
  const VALID_TOKEN = "ptk_http_token_abc123";
  const VALID_TOKEN_HASH = sha256(VALID_TOKEN);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /v1/telemetry Ingestion Endpoint", () => {
    it("Rejects unauthenticated telemetry ingestion with 401", async () => {
      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature: 25.5 }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Missing authorization device token");
    });

    it("Rejects revoked hardware token with 401", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_revoked",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: BigInt(Date.now() - 1000),
      });

      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-token": VALID_TOKEN,
        },
        body: JSON.stringify({ temperature: 25.5 }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Invalid or revoked");
    });

    it("Rejects malformed deviceId with invalid characters (directory traversal / SQL injection)", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_ok",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: null,
      });

      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-token": VALID_TOKEN,
        },
        body: JSON.stringify({
          deviceId: "../../etc/shadow",
          temperature: 25.5,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid deviceId format");
    });

    it("VULN-IOT-04 Fix: Rejects cross-token device hijacking within a project with 403", async () => {
      // Token belongs to Device 2
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_device_2",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: null,
      });

      // Target device belongs to Device 1 (different token)
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "dev_device_1",
        projectId: "prj_test",
        tokenId: "tok_device_1", // DIFFERENT token!
        deviceKey: "device-1",
      });

      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-token": VALID_TOKEN,
        },
        body: JSON.stringify({
          deviceId: "device-1",
          temperature: 25.5,
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Device ownership conflict");
    });

    it("VULN-IOT-05 Fix: Sanitizes wild hardware timestamps (> 24h past or future drift)", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_ok",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: null,
      });
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "dev_1",
        projectId: "prj_test",
        tokenId: "tok_ok",
      });

      const futureTs = Date.now() + 1000 * 3600 * 24 * 365 * 5; // 5 years in future

      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-token": VALID_TOKEN,
        },
        body: JSON.stringify({
          ts: futureTs,
          temperature: 25.5,
        }),
      });

      expect(res.status).toBe(200);
      // Verify timestamp written to DB is close to current time (not 5 years in future)
      expect(prisma.telemetry.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              timestamp: expect.any(BigInt),
            }),
          ]),
        })
      );
      const writtenCall = (prisma.telemetry.createMany as any).mock.calls[0][0];
      const writtenTs = Number(writtenCall.data[0].timestamp);
      expect(writtenTs).toBeLessThan(Date.now() + 60000);
      expect(writtenTs).toBeGreaterThan(Date.now() - 60000);
    });

    it("VULN-IOT-06 Fix: Limits excessive metric keys and filters malformed key names", async () => {
      (prisma.projectToken.findUnique as any).mockResolvedValue({
        id: "tok_ok",
        projectId: "prj_test",
        hash: VALID_TOKEN_HASH,
        revokedAt: null,
      });
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "dev_1",
        projectId: "prj_test",
        tokenId: "tok_ok",
      });

      // Construct payload with 70 keys and one invalid key name
      const metrics: Record<string, number> = {};
      for (let i = 0; i < 70; i++) {
        metrics[`metric_${i}`] = i;
      }
      metrics["invalid/key/name"] = 999;

      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-token": VALID_TOKEN,
        },
        body: JSON.stringify({ metrics }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      // Should cap at max 50 keys and exclude the invalid key
      expect(data.processed).toBeLessThanOrEqual(50);
    });
  });

  describe("POST /v1/control Downlink Security", () => {
    it("VULN-IOT-07 Fix: Rejects control request with path traversal or wildcard characters", async () => {
      (prisma.session.findUnique as any).mockResolvedValue({
        id: "sess_admin",
        userId: "usr_admin",
        expiresAt: BigInt(Date.now() + 3600000),
        user: { id: "usr_admin", role: "admin", status: "active" },
      });

      const res = await app.request("/v1/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": "sess_admin",
        },
        body: JSON.stringify({
          projectId: "prj_1",
          deviceId: "dev_1/evil/subtopic", // invalid path traversal attempt
          variable: "relay",
          value: 1,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid characters");
    });

    it("VULN-IOT-06 Fix: Rejects oversized telemetry payload (>64KB) with 413 Payload Too Large", async () => {
      // Generate 70KB oversized payload
      const hugeString = "A".repeat(70 * 1024);

      const res = await app.request("/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-token": VALID_TOKEN,
        },
        body: JSON.stringify({ huge: hugeString }),
      });

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toContain("Payload too large");
    });

    it("Anti-Replay Verification: Downlink control triggers publishDeviceCommand with command parameters", async () => {
      const { publishDeviceCommand } = await import("../lib/emqx");
      (prisma.session.findUnique as any).mockResolvedValue({
        id: "sess_admin",
        userId: "usr_admin",
        expiresAt: BigInt(Date.now() + 3600000),
        user: { id: "usr_admin", role: "admin", status: "active" },
      });
      (prisma.device.findFirst as any).mockResolvedValue({
        id: "dev_target",
        projectId: "prj_1",
      });

      const res = await app.request("/v1/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": "sess_admin",
        },
        body: JSON.stringify({
          projectId: "prj_1",
          deviceId: "dev_target",
          variable: "fan_speed",
          value: 80,
        }),
      });

      expect(res.status).toBe(200);
      expect(publishDeviceCommand).toHaveBeenCalledWith(
        "prj_1",
        "dev_target",
        expect.objectContaining({ fan_speed: 80 })
      );
    });
  });
});
