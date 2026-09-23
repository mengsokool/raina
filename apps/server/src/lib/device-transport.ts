import { randomUUID } from "node:crypto";
import { prisma } from "@raina/db";
import { ValueType } from "@raina-iot/rlp";
import { getRedisClient, initRedis } from "./redis";
import { eventBus } from "./events";
import { config } from "../config";

const COMMAND_CHANNEL = "raina:rlp:commands";
const DISCONNECT_CHANNEL = "raina:rlp:disconnect";
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_.-]{1,64}$/;

export type RlpCommandEnvelope = {
  id: string;
  projectId: string;
  deviceId: string;
  connectionId: string;
  channel: number;
  valueType: ValueType;
  value: boolean | number | string;
  createdAt: number;
};

export type RlpDisconnectEnvelope = {
  projectId: string;
  deviceId: string;
  connectionId: string;
  reason: "revoked" | "deleted";
};

function valueTypeFor(value: unknown): { valueType: ValueType; value: boolean | number | string } | null {
  if (typeof value === "boolean") return { valueType: ValueType.BOOL, value };
  if (typeof value === "number" && Number.isFinite(value)) {
    if (!Number.isInteger(value)) return { valueType: ValueType.FLOAT64, value };
    if (value >= 0 && value <= 0xffff) return { valueType: ValueType.UINT16, value };
    if (value >= -0x80000000 && value <= 0x7fffffff) return { valueType: ValueType.INT32, value };
    return { valueType: ValueType.FLOAT64, value };
  }
  if (typeof value === "string" && Buffer.byteLength(value, "utf8") <= 512) return { valueType: ValueType.STRING, value };
  return null;
}

/** Queue an authenticated device command through Redis or in-process bus to the owning RLP gateway. */
export async function publishDeviceCommand(projectId: string, deviceId: string, command: Record<string, unknown>) {
  if (!SAFE_IDENTIFIER.test(projectId) || !SAFE_IDENTIFIER.test(deviceId)) return false;

  const device = await prisma.device.findFirst({ where: { id: deviceId, projectId }, select: { id: true, deviceKey: true } });
  if (!device) return false;
  const variables = await prisma.projectVariable.findMany({
    where: { projectId, deviceId, key: { in: Object.keys(command).slice(0, 20) } },
    select: { key: true, rlpChannel: true },
  });
  const channels = new Map(variables.map((variable) => [variable.key, variable.rlpChannel]));
  const connectionId = device.deviceKey || device.id;
  const messages: RlpCommandEnvelope[] = [];

  for (const [key, rawValue] of Object.entries(command).slice(0, 20)) {
    const channel = channels.get(key);
    const typed = valueTypeFor(rawValue);
    if (!channel || !typed) {
      console.warn(`[RLP] Command skipped for ${projectId}/${deviceId}/${key}: missing channel or unsupported value`);
      continue;
    }
    messages.push({ id: randomUUID(), projectId, deviceId, connectionId, channel, ...typed, createdAt: Date.now() });
  }

  if (messages.length === 0) return false;

  if (config.redisEnabled) {
    await initRedis();
    const redis = getRedisClient();
    if (redis) {
      await Promise.all(messages.map((message) => redis.publish(COMMAND_CHANNEL, JSON.stringify(message))));
      return true;
    }
    console.warn("[RLP] Redis is enabled but client is unavailable, falling back to in-process bus");
  }

  // In-process fallback: emit onto local eventBus
  for (const message of messages) {
    eventBus.emit(COMMAND_CHANNEL, JSON.stringify(message));
  }
  return true;
}

export async function disconnectRlpDevice(projectId: string, deviceId: string, connectionId: string, reason: RlpDisconnectEnvelope["reason"]) {
  const envelope: RlpDisconnectEnvelope = { projectId, deviceId, connectionId, reason };
  if (config.redisEnabled) {
    await initRedis();
    const redis = getRedisClient();
    if (redis) {
      await redis.publish(DISCONNECT_CHANNEL, JSON.stringify(envelope));
      return true;
    }
  }
  eventBus.emit(DISCONNECT_CHANNEL, JSON.stringify(envelope));
  return true;
}

export const rlpCommandChannel = COMMAND_CHANNEL;
export const rlpDisconnectChannel = DISCONNECT_CHANNEL;
