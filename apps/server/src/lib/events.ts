import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(500);

export type RealtimeTelemetryEvent = { type: "telemetry"; projectId: string; deviceId: string; variable: string; value: unknown; timestamp: number };
export type RealtimeControlEvent = { type: "control"; projectId: string; deviceId?: string; variable: string; value: unknown; timestamp: number };
export type RealtimeDeviceStatusEvent = { type: "device_status"; projectId: string; deviceId: string; status: "online" | "offline"; timestamp: number };
export type RealtimeAutomationEvent = { type: "automation_event"; projectId: string; event: string; context?: Record<string, unknown>; timestamp: number };
export type RealtimeEvent = RealtimeTelemetryEvent | RealtimeControlEvent | RealtimeDeviceStatusEvent | RealtimeAutomationEvent;

type Envelope = { source: string; event: RealtimeEvent };
const instanceId = randomUUID();
const redisEnabled = process.env.REDIS_ENABLED === "true";
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
let publisher: RedisClientType | null = null;
let subscriber: RedisClientType | null = null;
let redisState: "disabled" | "connecting" | "connected" | "degraded" = redisEnabled ? "connecting" : "disabled";
let redisError: string | null = null;

function channel(projectId: string) { return `raina:project:${projectId}:realtime`; }
function emit(event: RealtimeEvent) { eventBus.emit(`project:${event.projectId}`, event); }

export async function initRealtimeBus() {
  if (!redisEnabled || publisher || subscriber) return;
  try {
    publisher = createClient({ url: redisUrl });
    subscriber = publisher.duplicate();
    const onError = (error: Error) => { redisState = "degraded"; redisError = error.message; };
    publisher.on("error", onError);
    subscriber.on("error", onError);
    await Promise.all([publisher.connect(), subscriber.connect()]);
    await subscriber.pSubscribe("raina:project:*:realtime", (raw) => {
      try {
        const { source, event } = JSON.parse(raw) as Envelope;
        if (source !== instanceId && event?.projectId) emit(event);
      } catch {}
    });
    redisState = "connected";
    redisError = null;
  } catch (error) {
    redisState = "degraded";
    redisError = error instanceof Error ? error.message : "Redis connection failed";
    publisher = null;
    subscriber = null;
  }
}

export async function closeRealtimeBus() {
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()].filter(Boolean) as Promise<unknown>[]);
  publisher = null;
  subscriber = null;
  redisState = redisEnabled ? "degraded" : "disabled";
}

export function getRealtimeBusStatus() { return { enabled: redisEnabled, status: redisState, error: redisError }; }

function publish(event: RealtimeEvent) {
  emit(event);
  if (publisher?.isOpen) void publisher.publish(channel(event.projectId), JSON.stringify({ source: instanceId, event } satisfies Envelope)).catch(() => {});
}

export function broadcastTelemetry(event: Omit<RealtimeTelemetryEvent, "type">) { publish({ ...event, type: "telemetry" }); }
export function broadcastControl(event: Omit<RealtimeControlEvent, "type">) { publish({ ...event, type: "control" }); }
export function broadcastEvent(event: RealtimeEvent) { publish(event); }
