import "../load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection, type Socket } from "node:net";
import crypto from "node:crypto";
import { prisma } from "@raina/db";
import {
  createRlpServer,
  ErrorCode,
  PacketType,
  PROTOCOL_VERSION,
  ValueType,
  type Hello,
  type RlpConnection,
  type RlpValue,
} from "@raina-iot/rlp";
import { processTelemetryPayload } from "../services/telemetry.service";
import { getRedisClient, initRedis, closeRedis } from "../lib/redis";
import { publishDeviceCommand } from "../lib/device-transport";

function sha256(val: string) {
  return crypto.createHash("sha256").update(val).digest("hex");
}

function frame(type: PacketType, payload = Buffer.alloc(0)) {
  const header = Buffer.allocUnsafe(4);
  header[0] = type;
  header[1] = 0;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function lp8(value: string) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function lp16(value: Buffer) {
  const length = Buffer.allocUnsafe(2);
  length.writeUInt16BE(value.length);
  return Buffer.concat([length, value]);
}

function encodeFloat64(val: number) {
  const b = Buffer.allocUnsafe(8);
  b.writeDoubleBE(val);
  return b;
}

describe("RLP End-to-End IoT Gateway & Data Communication", () => {
  let server: ReturnType<typeof createRlpServer>;
  let serverPort: number;
  const testProjectId = "proj_farm_01";
  const testPlainToken = "raina_project_token_farm_01";
  const testDeviceId = "dev_default_01";

  beforeAll(async () => {
    await initRedis();

    // Setup gateway with authentication backed by Prisma DB
    server = createRlpServer({
      host: "127.0.0.1",
      port: 0,
      authenticate: async (hello: Hello) => {
        const token = hello.credential.toString("utf8");
        const projectToken = await prisma.projectToken.findUnique({
          where: { hash: sha256(token) },
        });
        if (!projectToken || projectToken.revokedAt) return { accept: false };

        const channels = new Map<number, string>([
          [1, "temperature"],
          [2, "humidity"],
          [3, "pump_relay"],
        ]);

        return {
          accept: true,
          context: {
            projectId: projectToken.projectId,
            tokenId: projectToken.id,
            deviceId: hello.deviceId,
            connectionId: hello.deviceId,
            channels,
          },
        };
      },
    });

    server.on("data", async ({ connection, sample }) => {
      const ctx = connection.context as any;
      const key = ctx.channels.get(sample.channel);
      if (!key) return;
      await processTelemetryPayload({
        projectId: ctx.projectId,
        tokenId: ctx.tokenId,
        deviceId: ctx.deviceId,
        metrics: { [key]: sample.value },
        timestamp: Date.now(),
      });
    });

    const addr = await server.listen();
    serverPort = addr.port;
  });

  afterAll(async () => {
    if (server) await server.close();
    await closeRedis();
    await prisma.$disconnect();
  });

  it("completes full handshake, transmits telemetry, updates PostgreSQL, and handles downlink control", async () => {
    const socket: Socket = createConnection({ host: "127.0.0.1", port: serverPort });

    let welcomed = false;
    let receivedCommand: { id: number; channel: number; value: boolean } | null = null;

    // 1. Handshake HELLO -> WELCOME
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => {
        const channels = { temperature: 1, humidity: 2, pump_relay: 3 };
        const capabilities = Buffer.from(JSON.stringify({ raina: { channels } }), "utf8");
        const payload = Buffer.concat([
          Buffer.from([PROTOCOL_VERSION]),
          lp8(testDeviceId),
          lp16(Buffer.from(testPlainToken, "utf8")),
          lp16(capabilities),
        ]);
        socket.write(frame(PacketType.HELLO, payload));
      });

      socket.on("data", (chunk) => {
        let offset = 0;
        while (offset + 4 <= chunk.length) {
          const type = chunk[offset];
          const len = chunk.readUInt16BE(offset + 2);
          const payload = chunk.subarray(offset + 4, offset + 4 + len);
          offset += 4 + len;

          if (type === PacketType.WELCOME) {
            welcomed = true;
            resolve();
          } else if (type === PacketType.COMMAND) {
            const cmdId = payload.readUInt32BE(0);
            const channel = payload.readUInt16BE(4);
            const val = payload[7] === 1;
            receivedCommand = { id: cmdId, channel, value: val };

            // Send ACK back
            const ackPayload = Buffer.allocUnsafe(5);
            ackPayload.writeUInt32BE(cmdId, 0);
            ackPayload[4] = 0; // OK
            socket.write(frame(PacketType.ACK, ackPayload));
          }
        }
      });

      socket.on("error", reject);
    });

    expect(welcomed).toBe(true);

    // 2. Uplink Telemetry (Channel 1: temperature = 35.8°C)
    const testTemp = 35.8;
    const sampleHead = Buffer.allocUnsafe(3);
    sampleHead.writeUInt16BE(1, 0); // Channel 1
    sampleHead[2] = ValueType.FLOAT64;
    const sampleBody = Buffer.concat([sampleHead, encodeFloat64(testTemp)]);
    socket.write(frame(PacketType.DATA, sampleBody));

    // Wait for async ingestion
    await new Promise((r) => setTimeout(r, 600));

    // Verify in PostgreSQL database
    const variable = await prisma.projectVariable.findUnique({
      where: {
        projectId_deviceId_key: {
          projectId: testProjectId,
          deviceId: testDeviceId,
          key: "temperature",
        },
      },
    });

    expect(variable).toBeDefined();
    expect(Number(variable?.value)).toBe(testTemp);

    // 3. Downlink Control Command (Server -> Device)
    server.command(testDeviceId, {
      channel: 3, // pump_relay
      valueType: ValueType.BOOL,
      value: true,
    });

    // Wait for downlink packet delivery
    await new Promise((r) => setTimeout(r, 600));

    expect(receivedCommand).not.toBeNull();
    expect(receivedCommand?.channel).toBe(3);
    expect(receivedCommand?.value).toBe(true);

    socket.destroy();
  });
});
