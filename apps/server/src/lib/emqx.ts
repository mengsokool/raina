import mqtt from "mqtt";
import { processTelemetryPayload } from "../services/telemetry.service";
import { broadcastEvent } from "./events";
import { prisma } from "@raina/db";

const EMQX_URL = process.env.EMQX_BROKER_URL || "mqtt://127.0.0.1:1883";
const EMQX_SERVER_PASSWORD =
  process.env.EMQX_SERVER_PASSWORD ||
  process.env.JWT_SECRET ||
  "raina-internal-broker-secret";

let client: mqtt.MqttClient | null = null;

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;

function sanitizeTimestamp(rawTs: unknown): number {
  const now = Date.now();
  if (typeof rawTs !== "number" || isNaN(rawTs) || !isFinite(rawTs)) {
    return now;
  }
  const tsInMs = rawTs > 1e11 ? rawTs : rawTs * 1000;
  // Accept timestamps within [-24h, +10m]
  const minAllowed = now - 24 * 60 * 60 * 1000;
  const maxAllowed = now + 10 * 60 * 1000;
  if (tsInMs < minAllowed || tsInMs > maxAllowed) {
    return now;
  }
  return Math.floor(tsInMs);
}

export function initEmqx(options: { subscribeTelemetry?: boolean; ensureAuthentication?: boolean } = {}) {
  const subscribeTelemetry = options.subscribeTelemetry !== false;
  const ensureAuthentication = options.ensureAuthentication !== false;
  // Automatically provision and verify EMQX token authentication on startup
  if (ensureAuthentication) {
    ensureEmqxAuthentication().catch((e) => {
      console.warn("[EMQX-INIT] Background auth bootstrap warning:", (e as Error).message);
    });
  }

  try {
    client = mqtt.connect(EMQX_URL, {
      clientId: `raina-server-${Math.random().toString(16).slice(2, 10)}`,
      username: "raina-server",
      password: EMQX_SERVER_PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
    });

    client.on("connect", () => {
      console.log(`[EMQX] Connected to broker at ${EMQX_URL}`);
      if (subscribeTelemetry) {
        // Subscribe to both v1 taxonomy and legacy topics.
        client?.subscribe("v1/+/devices/+/telemetry");
        client?.subscribe("v1/+/devices/+/state");
        client?.subscribe("v1/+/devices/+/events");
        client?.subscribe("projects/+/devices/+/telemetry");
        client?.subscribe("projects/+/devices/+/status");
      }
    });

    client.on("message", async (topic, payload) => {
      if (!subscribeTelemetry) return;
      try {
        const parts = topic.split("/");
        let projectId = "";
        let deviceId = "";
        let action = "";

        // Support both: v1/{projectId}/devices/{deviceId}/{action} and projects/{projectId}/devices/{deviceId}/{action}
        if (parts[0] === "v1" && parts[2] === "devices") {
          projectId = parts[1];
          deviceId = parts[3];
          action = parts[4];
        } else if (parts[0] === "projects" && parts[2] === "devices") {
          projectId = parts[1];
          deviceId = parts[3];
          action = parts[4];
        }

        if (
          projectId &&
          deviceId &&
          action &&
          SAFE_IDENTIFIER_REGEX.test(projectId) &&
          SAFE_IDENTIFIER_REGEX.test(deviceId)
        ) {
          const data = JSON.parse(payload.toString());

          if (action === "telemetry") {
            const metrics =
              typeof data === "object" && data !== null && "metrics" in data
                ? (data.metrics as Record<string, unknown>)
                : (data as Record<string, unknown>);

            const timestamp = sanitizeTimestamp(data.ts ?? data.timestamp);

            await processTelemetryPayload({
              projectId,
              deviceId,
              metrics,
              timestamp,
            });
          } else if (action === "status" || action === "state") {
            const isOnline = data.status === "online";
            const now = BigInt(Date.now());
            await prisma.device
              .updateMany({
                where: { id: deviceId, projectId },
                data: { lastSeen: now },
              })
              .catch(() => {});

            broadcastEvent({
              type: "device_status",
              projectId,
              deviceId,
              status: isOnline ? "online" : "offline",
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {
        console.error("[EMQX Message Parse Error]:", err);
      }
    });

    client.on("error", (err) => {
      console.warn(`[EMQX] Warning (broker offline or connecting):`, err.message);
    });
  } catch (e) {
    console.warn(`[EMQX] Init error:`, (e as Error).message);
  }
}

import { nanoid } from "nanoid";

export function publishDeviceCommand(
  projectId: string,
  deviceId: string,
  command: Record<string, unknown>
) {
  if (!SAFE_IDENTIFIER_REGEX.test(projectId) || !SAFE_IDENTIFIER_REGEX.test(deviceId)) {
    console.error(`[EMQX] Invalid characters in projectId (${projectId}) or deviceId (${deviceId})`);
    return;
  }

  if (client && client.connected) {
    // Wrap with anti-replay envelope (unique command ID + timestamp)
    const envelopedCommand = {
      ...command,
      cmd_id: `cmd_${nanoid(16)}`,
      ts: Date.now(),
    };

    // Publish to both modern v1 commands topic and legacy control topic
    const v1Topic = `v1/${projectId}/devices/${deviceId}/commands`;
    const legacyTopic = `projects/${projectId}/devices/${deviceId}/control`;
    const payloadStr = JSON.stringify(envelopedCommand);

    client.publish(v1Topic, payloadStr, { qos: 1 });
    client.publish(legacyTopic, payloadStr, { qos: 1 });
  }
}

/**
 * Forcibly disconnects an active MQTT client from EMQX Broker.
 * Called immediately upon device deletion or hardware token revocation.
 */
export async function kickEmqxClient(clientId: string): Promise<boolean> {
  const emqxApiUrl = process.env.EMQX_API_URL || "http://127.0.0.1:18083";
  const emqxUser = process.env.EMQX_DASHBOARD_USERNAME || "admin";
  const emqxPass = process.env.EMQX_DASHBOARD_PASSWORD || "rainasecret";
  try {
    const loginRes = await fetch(`${emqxApiUrl}/api/v5/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: emqxUser, password: emqxPass }),
    });
    if (!loginRes.ok) return false;
    const { token } = (await loginRes.json()) as { token: string };
    const kickRes = await fetch(
      `${emqxApiUrl}/api/v5/clients/${encodeURIComponent(clientId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return kickRes.ok;
  } catch {
    return false;
  }
}

export function getEmqxStatus(): { connected: boolean; url: string } {
  return {
    connected: !!(client && client.connected),
    url: EMQX_URL,
  };
}

export async function closeEmqx(): Promise<void> {
  if (client) {
    return new Promise((resolve) => {
      client?.end(false, () => {
        console.log("[EMQX] Client disconnected cleanly");
        resolve();
      });
    });
  }
}

/**
 * Automatically provisions HTTP Token Authentication & ACL in EMQX on server startup.
 * Ensures zero-configuration deployment in production and development.
 */
export async function ensureEmqxAuthentication(): Promise<void> {
  const emqxApiUrl = process.env.EMQX_API_URL || "http://127.0.0.1:18083";
  const emqxUser = process.env.EMQX_DASHBOARD_USERNAME || "admin";
  const emqxPass = process.env.EMQX_DASHBOARD_PASSWORD || "rainasecret";
  const webhookAuthUrl = process.env.EMQX_AUTH_WEBHOOK_URL || (
    process.env.NODE_ENV === "production"
      ? "http://server:3001/v1/emqx/auth"
      : "http://host.docker.internal:3001/v1/emqx/auth"
  );
  const webhookAclUrl = process.env.EMQX_ACL_WEBHOOK_URL || (
    process.env.NODE_ENV === "production"
      ? "http://server:3001/v1/emqx/acl"
      : "http://host.docker.internal:3001/v1/emqx/acl"
  );

  try {
    // 1. Authenticate with EMQX Management REST API
    const loginRes = await fetch(`${emqxApiUrl}/api/v5/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: emqxUser, password: emqxPass }),
    });

    if (!loginRes.ok) {
      // EMQX might still be booting up; quietly skip
      return;
    }

    const { token } = await loginRes.json() as { token: string };
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 2. Check and provision HTTP Token Authentication
    const authnRes = await fetch(`${emqxApiUrl}/api/v5/authentication`, { headers });
    if (authnRes.ok) {
      const authenticators = await authnRes.json();
      const hasHttpAuth = Array.isArray(authenticators) && authenticators.some(
        (a: any) => a.backend === "http" || a.id === "password_based:http"
      );

      if (!hasHttpAuth) {
        console.log(`[EMQX-INIT] Auto-registering HTTP Token Authenticator (${webhookAuthUrl})...`);
        const webhookHeaders: Record<string, string> = { "content-type": "application/json" };
        if (process.env.EMQX_WEBHOOK_SECRET) {
          webhookHeaders["x-emqx-secret"] = process.env.EMQX_WEBHOOK_SECRET;
        }

        const addAuthn = await fetch(`${emqxApiUrl}/api/v5/authentication`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            mechanism: "password_based",
            backend: "http",
            method: "post",
            url: webhookAuthUrl,
            headers: webhookHeaders,
            body: {
              clientid: "${clientid}",
              username: "${username}",
              password: "${password}",
            },
          }),
        });
        if (addAuthn.ok) {
          console.log("✅ [EMQX-INIT] Successfully registered HTTP Token Authenticator!");
        }
      }
    }

    // 3. Check and provision HTTP ACL Authorization
    const authzRes = await fetch(`${emqxApiUrl}/api/v5/authorization/sources`, { headers });
    if (authzRes.ok) {
      const authzData = await authzRes.json() as { sources?: Array<{ type: string }> };
      const sources = authzData.sources || [];
      const hasHttpAcl = Array.isArray(sources) && sources.some((s: any) => s.type === "http");

      if (!hasHttpAcl) {
        console.log(`[EMQX-INIT] Auto-registering HTTP ACL Authorization (${webhookAclUrl})...`);
        const webhookHeaders: Record<string, string> = { "content-type": "application/json" };
        if (process.env.EMQX_WEBHOOK_SECRET) {
          webhookHeaders["x-emqx-secret"] = process.env.EMQX_WEBHOOK_SECRET;
        }

        const addAuthz = await fetch(`${emqxApiUrl}/api/v5/authorization/sources`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: "http",
            enable: true,
            method: "post",
            url: webhookAclUrl,
            headers: webhookHeaders,
            body: {
              clientid: "${clientid}",
              username: "${username}",
              topic: "${topic}",
              action: "${action}",
            },
          }),
        });
        if (addAuthz.ok) {
          console.log("✅ [EMQX-INIT] Successfully registered HTTP ACL Authorization!");
        }
      }
    }
  } catch (err: any) {
    // Non-fatal, EMQX may not be running yet
    console.warn("[EMQX-INIT] Background auth bootstrap info:", err.message);
  }
}
