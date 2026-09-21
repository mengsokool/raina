import { createClient, type RedisClientType } from "redis";
import { randomUUID } from "node:crypto";

type RedisClient = RedisClientType;

const enabled = process.env.REDIS_ENABLED === "true";
const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let client: RedisClient | null = null;
let subscriber: RedisClient | null = null;
let state: "disabled" | "connecting" | "connected" | "degraded" = enabled ? "connecting" : "disabled";
let lastError: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function markDegraded(error: Error) {
  state = "degraded";
  lastError = error.message;
}

function scheduleReconnect() {
  if (!enabled || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void initRedis();
  }, 5_000);
}

export async function initRedis() {
  if (!enabled || client || subscriber) return;

  try {
    client = createClient({ url });
    subscriber = client.duplicate();
    client.on("error", markDegraded);
    subscriber.on("error", markDegraded);
    const markConnected = () => {
      state = "connected";
      lastError = null;
    };
    client.on("ready", markConnected);
    subscriber.on("ready", markConnected);
    await Promise.all([client.connect(), subscriber.connect()]);
    state = "connected";
    lastError = null;
  } catch (error) {
    markDegraded(error instanceof Error ? error : new Error("Redis connection failed"));
    await Promise.allSettled([client?.quit(), subscriber?.quit()].filter(Boolean) as Promise<unknown>[]);
    client = null;
    subscriber = null;
    scheduleReconnect();
  }
}

export async function closeRedis() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  await Promise.allSettled([client?.quit(), subscriber?.quit()].filter(Boolean) as Promise<unknown>[]);
  client = null;
  subscriber = null;
  state = enabled ? "degraded" : "disabled";
}

export function getRedisClient() {
  return client?.isOpen ? client : null;
}

export function getRedisSubscriber() {
  return subscriber?.isOpen ? subscriber : null;
}

export function getRedisStatus() {
  return { enabled, status: state, error: lastError };
}

/** Acquire a short-lived, owner-token protected lock. Redis outages deliberately fail open. */
export async function withDistributedLock<T>(key: string, ttlMs: number, task: () => Promise<T>): Promise<T | undefined> {
  const redis = getRedisClient();
  if (!redis) return task();

  const owner = randomUUID();
  const acquired = await redis.set(key, owner, { NX: true, PX: ttlMs }).catch(() => null);
  if (acquired !== "OK") return undefined;

  try {
    return await task();
  } finally {
    // Only unlock if this process still owns the lock; never delete another worker's lock.
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
      { keys: [key], arguments: [owner] }
    ).catch(() => {});
  }
}
