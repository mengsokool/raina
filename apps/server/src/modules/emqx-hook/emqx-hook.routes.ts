import { Hono } from "hono";
import { prisma } from "@raina/db";
import crypto from "crypto";
import { nanoid } from "nanoid";

const router = new Hono();

const EMQX_SERVER_PASSWORD =
  process.env.EMQX_SERVER_PASSWORD ||
  process.env.JWT_SECRET ||
  "raina-internal-broker-secret";

const EMQX_WEBHOOK_SECRET = process.env.EMQX_WEBHOOK_SECRET || "";

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

// Optional webhook secret verification middleware
router.use("*", async (c, next) => {
  if (EMQX_WEBHOOK_SECRET) {
    const incomingSecret =
      c.req.header("x-emqx-secret") ||
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!incomingSecret || !safeCompare(incomingSecret, EMQX_WEBHOOK_SECRET)) {
      return c.json({ result: "deny", error: "Unauthorized webhook" }, 401);
    }
  }
  await next();
});

/**
 * EMQX Authentication Webhook
 * Triggered by EMQX when any MQTT client connects.
 *
 * Body from EMQX:
 * {
 *   "clientid": "esp32-greenhouse-1",
 *   "username": "prj_nendlBwHqS", // or "raina-server"
 *   "password": "ptk_..."          // Project Token or Server Secret
 * }
 */
router.post("/auth", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const clientid = String(body.clientid || "").trim();

  // Internal server subscriber authentication
  // MUST verify EMQX_SERVER_PASSWORD to prevent ClientID spoofing!
  const isServerClient =
    username === "raina-server" || clientid.startsWith("raina-server-");

  if (isServerClient) {
    if (password && safeCompare(password, EMQX_SERVER_PASSWORD)) {
      return c.json({ result: "allow", is_superuser: true });
    }
    // Reject any unauthorized client attempting to spoof server identity
    return c.json({ result: "deny" }, 200);
  }

  if (!password) {
    return c.json({ result: "deny" }, 200);
  }

  // Verify Project Token Hash
  const tokenHash = sha256(password);
  const projectToken = await prisma.projectToken.findUnique({
    where: { hash: tokenHash },
    include: { project: true },
  });

  if (!projectToken || projectToken.revokedAt) {
    return c.json({ result: "deny" }, 200);
  }

  // Multi-tenant principal binding: username (if provided) must match projectToken.projectId
  if (username && username !== projectToken.projectId) {
    return c.json({ result: "deny" }, 200);
  }

  // Update lastUsedAt
  await prisma.projectToken
    .update({
      where: { id: projectToken.id },
      data: { lastUsedAt: BigInt(Date.now()) },
    })
    .catch(() => {});

  // Sanitize device key: alphanumeric, dashes, underscores, max 64 chars
  const rawKey = clientid || username || "default";
  const deviceKey = rawKey.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64) || "default";
  const projectId = projectToken.projectId;

  // Device auto-registration upon successful connection
  const now = BigInt(Date.now());
  const existingDevice =
    (await prisma.device.findFirst({
      where: {
        projectId,
        OR: [
          { id: deviceKey },
          { deviceKey: deviceKey },
          { name: deviceKey },
        ],
      },
    })) ||
    (deviceKey === "default"
      ? await prisma.device.findFirst({
          where: { projectId, isDefault: true },
        })
      : null);

  if (existingDevice) {
    // Device token ownership check: prevent cross-token device hijacking/overwriting
    if (existingDevice.tokenId && existingDevice.tokenId !== projectToken.id) {
      return c.json({ result: "deny" }, 200);
    }

    await prisma.device
      .update({
        where: { id: existingDevice.id },
        data: {
          lastSeen: now,
          tokenId: projectToken.id,
          ...(!existingDevice.deviceKey ? { deviceKey } : {}),
        },
      })
      .catch(() => {});
  } else {
    // Generate safe, collision-free device ID
    const newDeviceId = `dev_${nanoid(16)}`;
    await prisma.device
      .create({
        data: {
          id: newDeviceId,
          projectId,
          tokenId: projectToken.id,
          name: deviceKey,
          deviceKey,
          createdAt: now,
          firstSeen: now,
          lastSeen: now,
        },
      })
      .catch(() => {});
  }

  return c.json({
    result: "allow",
    is_superuser: false,
  });
});

/**
 * EMQX Access Control List (ACL) Webhook
 * Enforces strict multi-tenant topic isolation per project AND per device.
 *
 * Body from EMQX:
 * {
 *   "clientid": "esp32-greenhouse-1",
 *   "username": "prj_nendlBwHqS",
 *   "topic": "v1/prj_nendlBwHqS/devices/esp32-greenhouse-1/telemetry",
 *   "action": "publish" | "subscribe"
 * }
 */
router.post("/acl", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const clientid = String(body.clientid || "").trim();
  const username = String(body.username || "").trim();
  const topic = String(body.topic || "").trim();
  const action = String(body.action || "").trim();

  // Allow verified internal server client full access
  if (username === "raina-server") {
    return c.json({ result: "allow" });
  }

  // Device clients are NEVER allowed to use wildcard subscriptions or publishing
  if (topic.includes("+") || topic.includes("#")) {
    return c.json({ result: "deny" });
  }

  // Extract and validate taxonomy: v1/{projectId}/devices/{deviceId}/{channel}
  // or legacy: projects/{projectId}/devices/{deviceId}/{channel}
  const parts = topic.split("/");
  if (parts.length !== 5) {
    return c.json({ result: "deny" });
  }

  const prefix = parts[0];
  const topicProjectId = parts[1];
  const devicesKeyword = parts[2];
  const topicDeviceId = parts[3];
  const topicChannel = parts[4];

  if ((prefix !== "v1" && prefix !== "projects") || devicesKeyword !== "devices") {
    return c.json({ result: "deny" });
  }

  if (!topicProjectId || !topicDeviceId || !topicChannel) {
    return c.json({ result: "deny" });
  }

  // Validate Project Isolation: username (if provided by device) must match topicProjectId
  if (username && username !== topicProjectId) {
    return c.json({ result: "deny" });
  }

  // Validate Cross-Device Isolation:
  // The device's clientid MUST match topicDeviceId (or sanitized deviceKey)
  // Devices CANNOT publish or subscribe to other devices' topics!
  if (clientid) {
    const sanitizedClientId = clientid.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
    if (clientid !== topicDeviceId && sanitizedClientId !== topicDeviceId) {
      return c.json({ result: "deny" });
    }
  }

  // Verify Device & Hardware Token Lifecycle State in DB:
  // If the device has been deleted/forgotten or if its bound token was revoked, reject access immediately!
  const device = await prisma.device.findFirst({
    where: {
      projectId: topicProjectId,
      OR: [
        { id: topicDeviceId },
        { deviceKey: topicDeviceId },
      ],
    },
    include: { token: true },
  });

  if (!device || (device.token && device.token.revokedAt)) {
    return c.json({ result: "deny" });
  }

  // Enforce Directional Topic Permissions:
  if (action === "publish") {
    // Devices may ONLY publish upstream telemetry/status
    const allowedUpstream = ["telemetry", "state", "status", "events"];
    if (allowedUpstream.includes(topicChannel)) {
      return c.json({ result: "allow" });
    }
    // Block devices from publishing to downlink command topics!
    return c.json({ result: "deny" });
  } else if (action === "subscribe") {
    // Devices may ONLY subscribe to downstream commands/control/ota
    const allowedDownstream = ["commands", "control", "ota"];
    if (allowedDownstream.includes(topicChannel)) {
      return c.json({ result: "allow" });
    }
    // Block devices from sniffing telemetry from other channels!
    return c.json({ result: "deny" });
  }

  return c.json({ result: "deny" });
});

export default router;
