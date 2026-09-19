import { EventEmitter } from "events";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(500);

export type RealtimeTelemetryEvent = {
  type: "telemetry";
  projectId: string;
  deviceId: string;
  variable: string;
  value: unknown;
  timestamp: number;
};

export type RealtimeControlEvent = {
  type: "control";
  projectId: string;
  deviceId?: string;
  variable: string;
  value: unknown;
  timestamp: number;
};

export type RealtimeDeviceStatusEvent = {
  type: "device_status";
  projectId: string;
  deviceId: string;
  status: "online" | "offline";
  timestamp: number;
};

export type RealtimeAutomationEvent = {
  type: "automation_event";
  projectId: string;
  event: string;
  context?: Record<string, unknown>;
  timestamp: number;
};

export type RealtimeEvent =
  | RealtimeTelemetryEvent
  | RealtimeControlEvent
  | RealtimeDeviceStatusEvent
  | RealtimeAutomationEvent;

export function broadcastTelemetry(event: Omit<RealtimeTelemetryEvent, "type">) {
  const payload: RealtimeTelemetryEvent = {
    ...event,
    type: "telemetry",
  };
  eventBus.emit(`project:${event.projectId}`, payload);
}

export function broadcastControl(event: Omit<RealtimeControlEvent, "type">) {
  const payload: RealtimeControlEvent = {
    ...event,
    type: "control",
  };
  eventBus.emit(`project:${event.projectId}`, payload);
}

export function broadcastEvent(event: RealtimeEvent) {
  eventBus.emit(`project:${event.projectId}`, event);
}

