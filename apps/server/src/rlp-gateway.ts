import "./load-env";

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createSecureContext } from "node:tls";
import { prisma } from "@raina/db";
import { createRlpServer, ErrorCode, type Hello, type RlpConnection, type RlpValue } from "@raina-iot/rlp";
import { broadcastEvent, eventBus } from "./lib/events";
import { getRedisClient, getRedisSubscriber, initRedis, closeRedis } from "./lib/redis";
import { rlpCommandChannel, rlpDisconnectChannel, type RlpCommandEnvelope, type RlpDisconnectEnvelope } from "./lib/device-transport";
import { getOrCreateDefaultDevice, processTelemetryPayload } from "./services/telemetry.service";
import { config } from "./config";

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_.-]{1,64}$/;
const gatewayId = crypto.randomUUID();
const leaseMs = config.rlpDeviceLeaseMs;
const requireRedis = config.rlpRequireRedis;
const requireTls = config.rlpRequireTls;
const active = new Map<string, RlpConnection>();
const leaseKey = (connectionId: string) => `raina:rlp:device:${connectionId}`;

type DeviceContext = { projectId: string; tokenId: string; deviceId: string; connectionId: string; channels: Map<number, string> };

function hash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function parseChannels(raw: Buffer) {
  if (!raw.length) return new Map<number, string>();
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as { raina?: { channels?: Record<string, unknown> } };
    const entries = Object.entries(parsed.raina?.channels || {});
    if (entries.length > 128) return null;
    const channels = new Map<number, string>();
    for (const [key, rawChannel] of entries) {
      const channel = Number(rawChannel);
      if (!SAFE_IDENTIFIER.test(key) || !Number.isInteger(channel) || channel < 1 || channel > 0xffff || channels.has(channel)) return null;
      channels.set(channel, key);
    }
    return channels;
  } catch { return null; }
}
async function claimLease(connectionId: string) {
  const redis = getRedisClient();
  if (!redis) return !requireRedis;
  const result = await redis.eval(
    "local current = redis.call('get', KEYS[1]); if not current or current == ARGV[1] then redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2]); return 1 end; return 0",
    { keys: [leaseKey(connectionId)], arguments: [gatewayId, String(leaseMs)] }
  ).catch(() => 0);
  return result === 1;
}
async function ownsLease(connectionId: string) {
  const redis = getRedisClient();
  if (!redis) return !requireRedis;
  return (await redis.get(leaseKey(connectionId)).catch(() => null)) === gatewayId;
}
async function releaseLease(connectionId: string) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", { keys: [leaseKey(connectionId)], arguments: [gatewayId] }).catch(() => {});
}
async function registerChannels(projectId: string, deviceId: string, channels: Map<number, string>) {
  const now = BigInt(Date.now());
  for (const [channel, key] of channels) {
    const occupied = await prisma.projectVariable.findFirst({ where: { projectId, rlpChannel: channel }, select: { id: true, key: true } });
    if (occupied && occupied.key !== key) throw new Error("channel conflict");
    const current = await prisma.projectVariable.findUnique({ where: { projectId_key: { projectId, key } } });
    if (current?.rlpChannel !== null && current?.rlpChannel !== undefined && current.rlpChannel !== channel) throw new Error("channel remapping denied");
    if (current) await prisma.projectVariable.update({ where: { id: current.id }, data: { deviceId, rlpChannel: channel, updatedAt: now } });
    else await prisma.projectVariable.create({ data: { id: `var_${projectId}_${key}`, projectId, deviceId, key, rlpChannel: channel, createdAt: now, updatedAt: now } });
  }
}
async function authenticate(hello: Hello) {
  if (!SAFE_IDENTIFIER.test(hello.deviceId)) return { accept: false };
  const channels = parseChannels(hello.capabilities);
  const token = hello.credential.toString("utf8");
  if (!channels || !token || Buffer.byteLength(token, "utf8") !== hello.credential.length) return { accept: false };
  const projectToken = await prisma.projectToken.findUnique({ where: { hash: hash(token) } });
  if (!projectToken || projectToken.revokedAt || !await claimLease(hello.deviceId)) return { accept: false };
  try {
    const deviceId = await getOrCreateDefaultDevice(projectToken.projectId, hello.deviceId, projectToken.id);
    await registerChannels(projectToken.projectId, deviceId, channels);
    void prisma.projectToken.update({ where: { id: projectToken.id }, data: { lastUsedAt: BigInt(Date.now()) } }).catch(() => {});
    return { accept: true, context: { projectId: projectToken.projectId, tokenId: projectToken.id, deviceId, connectionId: hello.deviceId, channels } satisfies DeviceContext };
  } catch {
    await releaseLease(hello.deviceId);
    return { accept: false };
  }
}
function scalar(value: RlpValue): boolean | number | string | null {
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint" && value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return null;
}
async function ingest(connection: RlpConnection, sample: { channel: number; value: RlpValue; timestamp?: bigint }) {
  const context = connection.context as DeviceContext;
  const key = context.channels.get(sample.channel);
  const value = scalar(sample.value);
  if (!key || value === null) return;
  const timestamp = sample.timestamp && sample.timestamp > 0n && sample.timestamp <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sample.timestamp) : Date.now();
  await processTelemetryPayload({ projectId: context.projectId, tokenId: context.tokenId, deviceId: context.deviceId, metrics: { [key]: value }, timestamp });
}

async function main() {
  await initRedis();
  if (requireRedis && !getRedisClient()) throw new Error("Redis is required for RLP command routing");
  const certPath = config.rlpTlsCertPath;
  const keyPath = config.rlpTlsKeyPath;
  if (requireTls && (!certPath || !keyPath)) throw new Error("RLP TLS requires RLP_TLS_CERT_PATH and RLP_TLS_KEY_PATH");
  // Caddy owns ACME renewal. SNI recreates the secure context for each new
  // handshake so an already-running gateway starts serving the renewed cert.
  const tls = certPath && keyPath ? {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
    minVersion: "TLSv1.2" as const,
    SNICallback: (_servername: string, callback: (error: Error | null, context?: ReturnType<typeof createSecureContext>) => void) => {
      try { callback(null, createSecureContext({ cert: readFileSync(certPath), key: readFileSync(keyPath), minVersion: "TLSv1.2" })); }
      catch (error) { callback(error instanceof Error ? error : new Error("Unable to load RLP TLS certificate")); }
    },
  } : undefined;
  const rlp = createRlpServer({ host: config.rlpHost, port: config.rlpPort, tls, authenticate, maxConnections: config.rlpMaxConnections, maxFrameSize: config.rlpMaxFrameSize, idleTimeoutMs: config.rlpIdleTimeoutMs });

  rlp.on("device:connect", (connection: RlpConnection) => { const context = connection.context as DeviceContext; active.set(context.connectionId, connection); broadcastEvent({ type: "device_status", projectId: context.projectId, deviceId: context.deviceId, status: "online", timestamp: Date.now() }); });
  rlp.on("device:disconnect", (connection: RlpConnection) => { const context = connection.context as DeviceContext | undefined; if (!context) return; active.delete(context.connectionId); void releaseLease(context.connectionId); broadcastEvent({ type: "device_status", projectId: context.projectId, deviceId: context.deviceId, status: "offline", timestamp: Date.now() }); });
  rlp.on("data", ({ connection, sample }) => void ingest(connection, sample).catch(() => {}));
  rlp.on("batch", ({ connection, samples }) => { for (const sample of samples) void ingest(connection, sample).catch(() => {}); });
  rlp.on("serverError", (error) => console.error("[RLP] Server error:", error));

  const subscriber = getRedisSubscriber();
  if (subscriber) {
    await subscriber.subscribe(rlpCommandChannel, async (raw) => {
      try { const message = JSON.parse(raw) as RlpCommandEnvelope; if (message && await ownsLease(message.connectionId)) rlp.command(message.connectionId, { channel: message.channel, valueType: message.valueType, value: message.value }); } catch {}
    });
    await subscriber.subscribe(rlpDisconnectChannel, async (raw) => {
      try { const message = JSON.parse(raw) as RlpDisconnectEnvelope; if (message && await ownsLease(message.connectionId)) active.get(message.connectionId)?.close(ErrorCode.AUTH_FAILED); } catch {}
    });
  } else if (requireRedis) {
    throw new Error("RLP Redis subscriber is unavailable");
  } else {
    console.info("[RLP] Standalone mode: using in-process eventBus for command routing");
    eventBus.on(rlpCommandChannel, async (raw) => {
      try { const message = JSON.parse(raw) as RlpCommandEnvelope; if (message && await ownsLease(message.connectionId)) rlp.command(message.connectionId, { channel: message.channel, valueType: message.valueType, value: message.value }); } catch {}
    });
    eventBus.on(rlpDisconnectChannel, async (raw) => {
      try { const message = JSON.parse(raw) as RlpDisconnectEnvelope; if (message && await ownsLease(message.connectionId)) active.get(message.connectionId)?.close(ErrorCode.AUTH_FAILED); } catch {}
    });
  }
  const renew = setInterval(() => { for (const id of active.keys()) void claimLease(id); }, Math.floor(leaseMs / 2));
  const address = await rlp.listen();
  console.log(`[RLP] Gateway ${gatewayId} listening on ${address.address}:${address.port}${tls ? " with TLS" : ""}`);
  const shutdown = async () => { clearInterval(renew); await rlp.close().catch(() => {}); await closeRedis(); await prisma.$disconnect(); process.exit(0); };
  process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());
}
void main().catch((error) => { console.error("[RLP] Gateway failed to start:", error); process.exit(1); });
