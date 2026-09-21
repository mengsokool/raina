"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sendControl as sendControlHttp } from "@/lib/api-client";

export type RealtimeConnectionMode = "ws" | "sse" | "disconnected";

interface UseDashboardRealtimeOptions {
  projectId?: string;
  dashboardId: string;
  enabled?: boolean;
  onEvent?: (event: any) => void;
  onMessage?: (event: any) => void;
}

function getWebSocketUrl(dashboardId: string): string {
  if (typeof window === "undefined") return "";

  const envWs = import.meta.env.VITE_WS_URL;
  if (envWs) {
    const base = envWs.replace(/\/$/, "");
    return `${base}/v1/dashboards/${dashboardId}/ws`;
  }

  // Direct port 3000 or dev port 5173: connect directly to Hono backend on port 3001
  if (window.location.port === "3000" || window.location.port === "5173") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:3001/v1/dashboards/${dashboardId}/ws`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/v1/dashboards/${dashboardId}/ws`;
}

export function useDashboardRealtime({
  projectId = "",
  dashboardId,
  enabled = true,
  onEvent,
  onMessage,
}: UseDashboardRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<RealtimeConnectionMode>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const callback = onEvent || onMessage || (() => {});
  const onEventRef = useRef(callback);
  onEventRef.current = callback;

  const retryCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);

  const startSseFallback = useCallback(() => {
    if (isUnmountedRef.current || sseRef.current) return;

    try {
      const eventSource = new EventSource(`/v1/dashboards/${dashboardId}/stream`);
      sseRef.current = eventSource;

      eventSource.onopen = () => {
        setConnected(true);
        setMode("sse");
      };

      const handleData = (str: string) => {
        try {
          const parsed = JSON.parse(str);
          onEventRef.current(parsed);
        } catch {}
      };

      eventSource.onmessage = (e) => handleData(e.data);
      eventSource.addEventListener("telemetry", (e: any) => handleData(e.data));
      eventSource.addEventListener("control", (e: any) => handleData(e.data));
      eventSource.addEventListener("snapshot", (e: any) => handleData(e.data));

      eventSource.onerror = () => {
        setConnected(false);
        setMode("disconnected");
      };
    } catch {
      setConnected(false);
      setMode("disconnected");
    }
  }, [dashboardId]);

  const connectWs = useCallback(async () => {
    if (!enabled || !dashboardId || isUnmountedRef.current) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ticketResponse = await fetch("/v1/auth/ws-ticket", { method: "POST", credentials: "same-origin" });
      const { ticket } = await ticketResponse.json();
      if (!ticketResponse.ok || typeof ticket !== "string") throw new Error("WebSocket ticket unavailable");
      const wsUrl = getWebSocketUrl(dashboardId);
      const ws = new WebSocket(wsUrl, `raina-ticket.${ticket}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }

        setConnected(true);
        setMode("ws");

        // Only reset retry count after maintaining a stable connection for 3 seconds
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        stableTimerRef.current = setTimeout(() => {
          retryCountRef.current = 0;
        }, 3000);

        if (sseRef.current) {
          sseRef.current.close();
          sseRef.current = null;
        }
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "ping") {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pong" }));
            }
            return;
          }
          onEventRef.current(data);
        } catch {}
      };

      ws.onerror = () => {
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        if (retryCountRef.current >= 2 && !sseRef.current) {
          startSseFallback();
        }
      };

      ws.onclose = () => {
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        if (isUnmountedRef.current) return;

        setConnected(false);
        retryCountRef.current++;

        if (retryCountRef.current < 2) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWs();
          }, 1000);
        } else if (!sseRef.current) {
          // Switch to SSE fallback after 2 failed attempts
          startSseFallback();
        }
      };
    } catch {
      startSseFallback();
    }
  }, [enabled, dashboardId, startSseFallback]);

  useEffect(() => {
    isUnmountedRef.current = false;
    if (enabled && dashboardId) {
      connectWs();
    }

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [enabled, dashboardId, connectWs]);

  const sendControl = useCallback(
    async (variable: string, value: unknown, deviceId?: string) => {
      // 1. Try sending over native WebSocket if open (Ultra Low-Latency Path)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "control",
            variable,
            value,
            deviceId,
          })
        );
        return;
      }

      // 2. Fallback to HTTP POST if WebSocket is disconnected
      await sendControlHttp(projectId, variable, value, deviceId);
    },
    [projectId]
  );

  return {
    connected,
    mode,
    sendControl,
  };
}
