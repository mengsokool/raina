import { prisma } from "@raina/db";
import { eventBus } from "../../lib/events";
import {
  authenticateSession,
  verifyDashboardAccess,
  verifyControlPermission,
} from "../../lib/auth";
import { telemetryModuleService } from "../telemetry/telemetry.service";
import { upgradeWebSocket } from "../../lib/ws";
import { loadDashboardSeries } from "./dashboard-series.service";

export const dashboardWsHandler = upgradeWebSocket((c) => {
  const id = c.req.param("id");

  let cleanup: (() => void) | null = null;

  return {
    async onOpen(evt, ws) {
      if (!id) {
        ws.close(1008, "Missing dashboard ID");
        return;
      }

      const dashboard = await prisma.dashboard.findUnique({
        where: { id },
      });

      if (!dashboard) {
        ws.close(1008, "Dashboard not found");
        return;
      }

      let user = null;
      if (dashboard.visibility !== "public") {
        user = await authenticateSession(c);
        if (!user) {
          ws.close(1008, "Unauthorized");
          return;
        }
        const { allowed } = await verifyDashboardAccess(user.id, user.role, dashboard.id);
        if (!allowed) {
          ws.close(1008, "Forbidden");
          return;
        }
      }

      const projectId = dashboard.projectId;

      let parsedLayout: any = { items: [] };
      try {
        parsedLayout = JSON.parse(dashboard.layout);
      } catch {}

      const activeVarKeys: string[] = [];
      for (const item of parsedLayout.items || []) {
        if (item.props?.variable && typeof item.props.variable === "string") {
          activeVarKeys.push(item.props.variable);
        }
        if (Array.isArray(item.props?.variables)) {
          for (const v of item.props.variables) {
            if (typeof v === "string") activeVarKeys.push(v);
          }
        }
        if (Array.isArray(item.props?.series)) {
          for (const s of item.props.series) {
            if (s?.variable && typeof s.variable === "string") {
              activeVarKeys.push(s.variable);
            }
          }
        }
      }
      const targetKeysSet = new Set(activeVarKeys);

      // 1. Send initial snapshot
      try {
        const variables = await prisma.projectVariable.findMany({
          where: { projectId },
        });

        const targetKeys =
          activeVarKeys.length > 0
            ? [...targetKeysSet]
            : variables.map((v) => v.key);

        const varMap: Record<string, unknown> = {};
        for (const v of variables) {
          if (activeVarKeys.length > 0 && !targetKeysSet.has(v.key)) continue;
          let parsed: unknown = v.value;
          if (v.value !== null && v.value !== undefined) {
            const num = Number(v.value);
            if (!isNaN(num) && isFinite(num)) parsed = num;
          }
          varMap[v.key] = parsed;
        }

        const series = await loadDashboardSeries(projectId, targetKeys);

        ws.send(
          JSON.stringify({
            type: "snapshot",
            projectId,
            variables: varMap,
            series,
            timestamp: Date.now(),
          })
        );
      } catch (err) {
        console.error(`[WS Init Error for ${id}]:`, err);
      }

      // 2. Subscribe to eventBus
      const onProjectEvent = (event: unknown) => {
        try {
          if (ws.readyState === 1) {
            if (activeVarKeys.length > 0) {
              const e = event as { type?: string; variable?: string; key?: string };
              if (e && (e.type === "telemetry" || e.type === "control")) {
                const vKey = e.variable || e.key;
                if (vKey && !targetKeysSet.has(vKey)) {
                  return;
                }
              }
            }
            ws.send(JSON.stringify(event));
          }
        } catch {}
      };

      eventBus.on(`project:${projectId}`, onProjectEvent);

      // 3. Heartbeat ping
      const pingInterval = setInterval(async () => {
        try {
          if (ws.readyState === 1) {
            const currentDash = await prisma.dashboard.findUnique({
              where: { id },
              select: { id: true, visibility: true },
            });
            if (!currentDash || currentDash.visibility === "disabled") {
              ws.close(1008, "Forbidden");
              cleanup();
              return;
            }
            if (currentDash.visibility !== "public") {
              if (!user) {
                ws.close(1008, "Unauthorized");
                cleanup();
                return;
              }
              const { allowed } = await verifyDashboardAccess(user.id, user.role, id);
              if (!allowed) {
                ws.close(1008, "Forbidden");
                cleanup();
                return;
              }
            }
            ws.send(JSON.stringify({ type: "ping" }));
          }
        } catch {
          clearInterval(pingInterval);
        }
      }, 20000);

      cleanup = () => {
        eventBus.off(`project:${projectId}`, onProjectEvent);
        clearInterval(pingInterval);
      };
    },

    async onMessage(evt, ws) {
      try {
        const payloadStr = typeof evt.data === "string" ? evt.data : evt.data.toString();
        const data = JSON.parse(payloadStr);

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (data.type === "pong") {
          return;
        }

        if (data.type === "control") {
          const dashboard = await prisma.dashboard.findUnique({
            where: { id },
          });
          if (!dashboard) return;

          const user = await authenticateSession(c);
          if (!user) {
            ws.send(JSON.stringify({ type: "error", error: "Unauthorized" }));
            return;
          }

          const canControl = await verifyControlPermission(user.id, user.role, dashboard.projectId);
          if (!canControl) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Forbidden: You do not have permission to control devices in this project",
              })
            );
            return;
          }

          const variableKey = data.variable || data.key;
          if (!variableKey || data.value === undefined) {
            ws.send(JSON.stringify({ type: "error", error: "Invalid control message format" }));
            return;
          }

          const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
          if (!SAFE_IDENTIFIER_REGEX.test(String(variableKey))) {
            ws.send(JSON.stringify({ type: "error", error: "Invalid variable key" }));
            return;
          }

          await telemetryModuleService.executeControl({
            projectId: dashboard.projectId,
            deviceId: data.deviceId,
            variableKey,
            value: data.value,
          });

          ws.send(
            JSON.stringify({
              type: "control_ack",
              variable: variableKey,
              value: data.value,
              timestamp: Date.now(),
            })
          );
        }
      } catch (err: any) {
        console.error(`[WS Message Error for ${id}]:`, err);
      }
    },

    onClose() {
      if (cleanup) cleanup();
    },

    onError() {
      if (cleanup) cleanup();
    },
  };
});
