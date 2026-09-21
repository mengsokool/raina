import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../index";
import { serve } from "@hono/node-server";
import { injectWebSocket } from "../lib/ws";
import { WebSocket } from "ws";
import { prisma } from "@raina/db";
import { broadcastTelemetry } from "../lib/events";
import { issueWsTicket } from "../lib/ws-ticket";
import type { Server } from "http";

// Mock @raina/db
vi.mock("@raina/db", () => ({
  prisma: {
    dashboard: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    projectVariable: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    telemetry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    automation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      findUnique: vi.fn(),
    },
    projectUser: {
      findFirst: vi.fn(),
    },
    device: {
      findFirst: vi.fn().mockResolvedValue({ id: "dev_default" }),
      create: vi.fn().mockResolvedValue({ id: "dev_default" }),
    },
  },
}));

// Mock device command transport
vi.mock("../lib/device-transport", () => ({
  publishDeviceCommand: vi.fn(),
}));

describe("Native WebSocket (WSS) Gateway", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    // Pick dynamic free port or standard test port
    port = 45123;
    server = serve({
      fetch: app.fetch,
      port,
    }) as unknown as Server;
    injectWebSocket(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers initial snapshot to connected WebSocket client", async () => {
    (prisma.dashboard.findUnique as any).mockResolvedValue({
      id: "dsh_test1",
      projectId: "proj_farm",
      visibility: "public",
      layout: JSON.stringify({ items: [{ props: { variable: "temp" } }] }),
    });

    (prisma.projectVariable.findMany as any).mockResolvedValue([
      { key: "temp", value: "25.4" },
    ]);

    const ws = new WebSocket(`ws://localhost:${port}/v1/dashboards/dsh_test1/ws`);

    const message = await new Promise<any>((resolve) => {
      ws.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "snapshot") {
          resolve(parsed);
        }
      });
    });

    expect(message.type).toBe("snapshot");
    expect(message.projectId).toBe("proj_farm");
    expect(message.variables.temp).toBe(25.4);

    ws.close();
  });

  it("handles ping and responds with pong", async () => {
    (prisma.dashboard.findUnique as any).mockResolvedValue({
      id: "dsh_test2",
      projectId: "proj_farm",
      visibility: "public",
      layout: JSON.stringify({ items: [] }),
    });

    const ws = new WebSocket(`ws://localhost:${port}/v1/dashboards/dsh_test2/ws`);

    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    ws.send(JSON.stringify({ type: "ping" }));

    const pong = await new Promise<any>((resolve) => {
      ws.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "pong") {
          resolve(parsed);
        }
      });
    });

    expect(pong.type).toBe("pong");
    ws.close();
  });

  it("receives telemetry broadcast pushed via eventBus", async () => {
    (prisma.dashboard.findUnique as any).mockResolvedValue({
      id: "dsh_test3",
      projectId: "proj_iot",
      visibility: "public",
      layout: JSON.stringify({ items: [] }),
    });

    const ws = new WebSocket(`ws://localhost:${port}/v1/dashboards/dsh_test3/ws`);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    // Wait a short tick for snapshot to be sent first
    await new Promise((r) => setTimeout(r, 50));

    const receivedTelemetry = new Promise<any>((resolve) => {
      ws.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "telemetry") {
          resolve(parsed);
        }
      });
    });

    broadcastTelemetry({
      projectId: "proj_iot",
      deviceId: "esp32_01",
      variable: "humidity",
      value: 72.5,
      timestamp: Date.now(),
    });

    const event = await receivedTelemetry;
    expect(event.type).toBe("telemetry");
    expect(event.variable).toBe("humidity");
    expect(event.value).toBe(72.5);

    ws.close();
  });

  it("processes inbound control command with a short-lived WebSocket ticket", async () => {
    process.env.JWT_SECRET = "test-ws-ticket-secret";
    const sessionToken = "a".repeat(64);
    (prisma.dashboard.findUnique as any).mockResolvedValue({
      id: "dsh_test4",
      projectId: "proj_farm",
      visibility: "private",
      layout: JSON.stringify({ items: [] }),
    });

    (prisma.session.findUnique as any).mockResolvedValue({
      token: sessionToken,
      expiresAt: BigInt(Date.now() + 3600000),
      user: {
        id: "usr_admin",
        role: "admin",
        email: "admin@raina.io",
      },
    });

    const ws = new WebSocket(`ws://localhost:${port}/v1/dashboards/dsh_test4/ws`, `raina-ticket.${issueWsTicket(sessionToken)}`);

    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    ws.send(
      JSON.stringify({
        type: "control",
        variable: "water_pump",
        value: true,
      })
    );

    const ack = await new Promise<any>((resolve) => {
      ws.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "control_ack") {
          resolve(parsed);
        }
      });
    });

    expect(ack.type).toBe("control_ack");
    expect(ack.variable).toBe("water_pump");
    expect(ack.value).toBe(true);

    ws.close();
  });
});
