import { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { createRouter } from "../../env";
import { authenticateSession, verifyProjectAccess, verifyControlPermission } from "../../lib/auth";
import { getRequiredParam } from "../../lib/params";
import { controlInputSchema } from "./telemetry.schema";
import { telemetryModuleService } from "./telemetry.service";

const handleTelemetry = async (c: Context) => {
  const authHeader = c.req.header("Authorization");
  const deviceTokenHeader = c.req.header("x-device-token");
  const token =
    deviceTokenHeader ||
    authHeader?.replace(/^Bearer\s+/i, "") ||
    c.req.query("token");

  if (!token) {
    return c.json({ error: "Missing authorization device token" }, 401);
  }

  const projectToken = await telemetryModuleService.authenticateDeviceToken(token);
  if (!projectToken) {
    return c.json({ error: "Invalid or revoked project token" }, 401);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON telemetry payload" }, 400);
  }

  if (!body || typeof body !== "object") {
    return c.json({ error: "Telemetry payload must be a JSON object" }, 400);
  }

  const rawDeviceId = body.deviceId || body.device_id;
  const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;

  if (rawDeviceId && typeof rawDeviceId === "string" && !SAFE_IDENTIFIER_REGEX.test(rawDeviceId.trim())) {
    return c.json({ error: "Invalid deviceId format" }, 400);
  }

  const metrics: Record<string, unknown> = body.metrics || body;

  let hardwareTs = Date.now();
  if (typeof body.ts === "number" && !isNaN(body.ts) && isFinite(body.ts)) {
    hardwareTs = body.ts > 1e11 ? body.ts : body.ts * 1000;
  } else if (typeof body.timestamp === "number" && !isNaN(body.timestamp) && isFinite(body.timestamp)) {
    hardwareTs = body.timestamp > 1e11 ? body.timestamp : body.timestamp * 1000;
  }

  const currentServerTime = Date.now();
  if (hardwareTs < currentServerTime - 24 * 60 * 60 * 1000 || hardwareTs > currentServerTime + 10 * 60 * 1000) {
    hardwareTs = currentServerTime;
  }

  try {
    const result = await telemetryModuleService.processIncomingTelemetry({
      projectId: projectToken.projectId,
      deviceId: rawDeviceId ? String(rawDeviceId).trim() : undefined,
      tokenId: projectToken.id,
      metrics,
      timestamp: hardwareTs,
    });

    return c.json({ ok: true, deviceId: result.deviceId, processed: result.processed.length });
  } catch (err: any) {
    if (err.message && err.message.includes("Device ownership conflict")) {
      return c.json({ error: err.message }, 403);
    }
    return c.json({ error: "Failed to process telemetry payload" }, 500);
  }
};

const handleControl = async (c: Context) => {
  const user = await authenticateSession(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON control payload" }, 400);
  }

  const projectId = body.projectId || body.project_id;
  const rawDeviceId = body.deviceId || body.device_id;
  const variableKey = body.variableKey || body.variable || body.key;
  const value = body.value;

  if (!projectId || !variableKey || value === undefined) {
    return c.json({ error: "Missing required fields (projectId, variable, value)" }, 400);
  }

  const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
  if (
    !SAFE_IDENTIFIER_REGEX.test(String(projectId)) ||
    !SAFE_IDENTIFIER_REGEX.test(String(variableKey)) ||
    (rawDeviceId && !SAFE_IDENTIFIER_REGEX.test(String(rawDeviceId)))
  ) {
    return c.json({ error: "Invalid characters in projectId, deviceId, or variable" }, 400);
  }

  const canControl = await verifyControlPermission(user.id, user.role, projectId);
  if (!canControl) {
    return c.json({ error: "Forbidden: You do not have permission to control devices in this project" }, 403);
  }

  const result = await telemetryModuleService.executeControl({
    projectId,
    deviceId: rawDeviceId,
    variableKey,
    value,
  });

  return c.json(result);
};

const handleHistory = async (c: Context) => {
  const user = await authenticateSession(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }

  const proj = getRequiredParam(c, "proj");
  const hasAccess = await verifyProjectAccess(user.id, user.role, proj, "view");
  if (!hasAccess) {
    return c.json({ error: "Forbidden: You do not have access to this project" }, 403);
  }

  const variable = c.req.query("variable") || c.req.query("key");
  const deviceId = c.req.query("deviceId");
  const limit = Math.min(Number(c.req.query("limit")) || 100, 1000);
  const fromQuery = c.req.query("from");
  const toQuery = c.req.query("to");
  const from = fromQuery ? BigInt(fromQuery) : undefined;
  const to = toQuery ? BigInt(toQuery) : undefined;

  if (!variable) {
    return c.json({ error: "Missing variable parameter" }, 400);
  }

  const result = await telemetryModuleService.getHistory({
    projectId: proj,
    variable,
    deviceId,
    limit,
    from,
    to,
  });

  return c.json(result);
};

export const telemetryRouter = createRouter()
  .post(
    "/telemetry",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: "Payload too large: Max telemetry size is 64KB" }, 413),
    }),
    handleTelemetry
  )
  .post("/control", zValidator("json", controlInputSchema), handleControl)
  .get("/projects/:proj/telemetry/history", handleHistory);

export default telemetryRouter;
