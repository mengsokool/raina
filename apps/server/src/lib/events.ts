import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { closeRedis, getRedisClient, getRedisStatus, getRedisSubscriber, initRedis } from "./redis";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(500);

export type RealtimeTelemetryEvent = { type: "telemetry"; projectId: string; deviceId: string; variable: string; value: unknown; timestamp: number };
export type RealtimeControlEvent = { type: "control"; projectId: string; deviceId?: string; variable: string; value: unknown; timestamp: number };
export type RealtimeDeviceStatusEvent = { type: "device_status"; projectId: string; deviceId: string; status: "online" | "offline"; timestamp: number };
export type RealtimeAutomationEvent = { type: "automation_event"; projectId: string; event: string; context?: Record<string, unknown>; timestamp: number };
export type RealtimeEvent = RealtimeTelemetryEvent | RealtimeControlEvent | RealtimeDeviceStatusEvent | RealtimeAutomationEvent;

type Envelope = { source: string; event: RealtimeEvent };
const instanceId = randomUUID();

function channel(projectId: string) { return `raina:project:${projectId}:realtime`; }
function emit(event: RealtimeEvent) { eventBus.emit(`project:${event.projectId}`, event); }

export async function initRealtimeBus() {
  await initRedis();
  const subscriber = getRedisSubscriber();
  if (!subscriber) return;
  try {
    await subscriber.pSubscribe("raina:project:*:realtime", (raw) => {
      try {
        const { source, event } = JSON.parse(raw) as Envelope;
        if (source !== instanceId && event?.projectId) emit(event);
      } catch {}
    });
  } catch {}
}

export async function closeRealtimeBus() {
  await closeRedis();
}

export function getRealtimeBusStatus() { return getRedisStatus(); }

function publish(event: RealtimeEvent) {
  emit(event);
  const publisher = getRedisClient();
  if (publisher) void publisher.publish(channel(event.projectId), JSON.stringify({ source: instanceId, event } satisfies Envelope)).catch(() => {});
}

export function broadcastTelemetry(event: Omit<RealtimeTelemetryEvent, "type">) { publish({ ...event, type: "telemetry" }); }
export function broadcastControl(event: Omit<RealtimeControlEvent, "type">) { publish({ ...event, type: "control" }); }
export function broadcastEvent(event: RealtimeEvent) { publish(event); }
