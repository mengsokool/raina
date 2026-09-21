import { afterEach, describe, expect, it } from "vitest";
import { createConnection } from "node:net";
import { createRlpServer, PacketType, PROTOCOL_VERSION } from "@raina/rlp";

const servers: Array<ReturnType<typeof createRlpServer>> = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); });

function hello(deviceId = "esp32_01", credential = "token") {
  const id = Buffer.from(deviceId); const token = Buffer.from(credential); const payload = Buffer.concat([Buffer.from([PROTOCOL_VERSION, id.length]), id, Buffer.from([0, token.length]), token, Buffer.from([0, 0])]);
  const frame = Buffer.alloc(4 + payload.length); frame[0] = PacketType.HELLO; frame.writeUInt16BE(payload.length, 2); payload.copy(frame, 4);
  return frame;
}

describe("RLP protocol hardening", () => {
  it("authenticates a HELLO and rejects a second HELLO on the same socket", async () => {
    const server = createRlpServer({ host: "127.0.0.1", port: 0, authenticate: () => ({ accept: true }), idleTimeoutMs: 1_000 });
    servers.push(server);
    const address = await server.listen();
    const received = await new Promise<Buffer>((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port: address.port });
      const chunks: Buffer[] = [];
      socket.on("connect", () => socket.write(Buffer.concat([hello(), hello()])));
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("close", () => resolve(Buffer.concat(chunks)));
      socket.on("error", reject);
    });
    expect(received[0]).toBe(PacketType.WELCOME);
    expect(received.includes(PacketType.ERROR)).toBe(true);
  });

  it("rejects an oversized frame before allocating its payload", async () => {
    const server = createRlpServer({ host: "127.0.0.1", port: 0, maxFrameSize: 32, authenticate: () => ({ accept: true }) });
    servers.push(server);
    const address = await server.listen();
    const received = await new Promise<Buffer>((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port: address.port });
      const chunks: Buffer[] = [];
      socket.on("connect", () => socket.write(Buffer.from([PacketType.DATA, 0, 1, 0])));
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("close", () => resolve(Buffer.concat(chunks)));
      socket.on("error", reject);
    });
    expect(received[0]).toBe(PacketType.ERROR);
  });
});
