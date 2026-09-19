import { Hono, type Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@raina/db";
import { nanoid } from "nanoid";
import { requireStaff } from "../../lib/auth";
import { sealIntegrationConfig, openIntegrationConfig } from "../../lib/crypto";
import { recordAudit } from "../../lib/audit";
import { getRequiredParam } from "../../lib/params";
import { integrations } from "@raina/workflow";

export const INTEGRATION_KINDS = [
  "http_service",
  "email",
  "telegram",
  "slack",
  "discord",
  "twilio",
  "ms_teams",
  "pagerduty",
] as const;

export type IntegrationKind = typeof INTEGRATION_KINDS[number];

const createIntegrationSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  kind: z.enum(INTEGRATION_KINDS, { errorMap: () => ({ message: "invalid kind" }) }),
  config: z.record(z.unknown()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

const updateIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(INTEGRATION_KINDS).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

function maskConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (
      /token|secret|password|api_key|auth|webhook/i.test(k) &&
      typeof v === "string" &&
      v.length > 4
    ) {
      sanitized[k] = `••••${v.slice(-4)}`;
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

const listIntegrationsHandler = async (c: Context) => {
  const proj = getRequiredParam(c, "proj");
  const rows = await prisma.integration.findMany({
    where: { projectId: proj, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const out = await Promise.all(
    rows.map(async (i) => {
      let cfg: Record<string, unknown> = {};
      try {
        const decrypted = await openIntegrationConfig(i.config);
        cfg = JSON.parse(decrypted);
      } catch {}

      return {
        id: i.id,
        name: i.name,
        kind: i.kind,
        config: maskConfig(cfg),
        enabled: i.enabled,
        created_at: Number(i.createdAt),
        updated_at: Number(i.updatedAt),
        last_run_at: i.lastRunAt ? Number(i.lastRunAt) : null,
        last_run_status: i.lastRunStatus || null,
      };
    })
  );

  return c.json(out);
};

const createIntegrationHandler = async (c: Context) => {
  const proj = getRequiredParam(c, "proj");
  const userId = c.get("userId") || c.get("user")?.id || null;
  const parsed = (await c.req.json()) as z.infer<typeof createIntegrationSchema>;

  const { name, kind, config, enabled } = parsed;
  const now = BigInt(Date.now());
  const id = `int_${nanoid(10)}`;

  // Seal sensitive config at rest
  const sealedConfig = await sealIntegrationConfig(config);

  const integration = await prisma.integration.create({
    data: {
      id,
      projectId: proj,
      name,
      kind,
      config: sealedConfig,
      enabled,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    },
  });

  await recordAudit({
    projectId: proj,
    userId,
    action: "integration.create",
    targetType: "integration",
    targetId: id,
    metadata: { name, kind },
  });

  return c.json(
    {
      id: integration.id,
      name: integration.name,
      kind: integration.kind,
      config: maskConfig(config),
      enabled: integration.enabled,
      created_at: Number(integration.createdAt),
      updated_at: Number(integration.updatedAt),
    },
    201
  );
};

const updateIntegrationHandler = async (c: Context) => {
  const proj = getRequiredParam(c, "proj");
  const id = getRequiredParam(c, "id");
  const userId = c.get("userId") || c.get("user")?.id || null;
  const body = (await c.req.json()) as z.infer<typeof updateIntegrationSchema>;

  if (Object.keys(body).length === 0) {
    return c.json({ error: "bad_request", message: "No fields to update" }, 400);
  }

  const existing = await prisma.integration.findFirst({
    where: { id, projectId: proj, archivedAt: null },
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = BigInt(Date.now());
  let sealedConfig = existing.config;

  if (body.config !== undefined) {
    // Decrypt existing config to safely merge
    let existingConfigObj: Record<string, unknown> = {};
    try {
      const decrypted = await openIntegrationConfig(existing.config);
      existingConfigObj = JSON.parse(decrypted);
    } catch {}

    const mergedConfig: Record<string, unknown> = { ...existingConfigObj };
    for (const [k, v] of Object.entries(body.config)) {
      // Prevent overwriting real secrets if UI submitted masked value '••••...'
      if (
        typeof v === "string" &&
        v.startsWith("••••") &&
        existingConfigObj[k] !== undefined
      ) {
        // Keep existing stored value
        continue;
      }
      mergedConfig[k] = v;
    }
    sealedConfig = await sealIntegrationConfig(mergedConfig);
  }

  const updated = await prisma.integration.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.config !== undefined ? { config: sealedConfig } : {}),
      ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
      updatedAt: now,
    },
  });

  const auditAction =
    typeof body.enabled === "boolean" && Object.keys(body).length === 1
      ? `integration.${body.enabled ? "enable" : "disable"}`
      : "integration.update";

  await recordAudit({
    projectId: proj,
    userId,
    action: auditAction,
    targetType: "integration",
    targetId: id,
    metadata: {
      name: updated.name,
      kind: updated.kind,
      enabled: updated.enabled,
    },
  });

  return c.json({
    id: updated.id,
    name: updated.name,
    kind: updated.kind,
    enabled: updated.enabled,
    updated_at: Number(updated.updatedAt),
  });
};

const deleteIntegrationHandler = async (c: Context) => {
  const proj = getRequiredParam(c, "proj");
  const id = getRequiredParam(c, "id");
  const userId = c.get("userId") || c.get("user")?.id || null;

  const existing = await prisma.integration.findFirst({
    where: { id, projectId: proj, archivedAt: null },
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = BigInt(Date.now());
  // Non-destructive soft delete via archivedAt
  await prisma.integration.update({
    where: { id },
    data: {
      archivedAt: now,
      updatedAt: now,
    },
  });

  await recordAudit({
    projectId: proj,
    userId,
    action: "integration.delete",
    targetType: "integration",
    targetId: id,
    metadata: { name: existing.name, kind: existing.kind },
  });

  return c.json({ success: true, id });
};

const testIntegrationHandler = async (c: Context) => {
  const proj = getRequiredParam(c, "proj");
  const id = getRequiredParam(c, "id");
  const userId = c.get("userId") || c.get("user")?.id || null;

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const row = await prisma.integration.findFirst({
    where: { id, projectId: proj, archivedAt: null },
  });
  if (!row) return c.json({ error: "not_found" }, 404);

  // Decrypt config for execution
  const decryptedConfig = await openIntegrationConfig(row.config);

  const testContext: integrations.IntegrationContext = {
    source: "test",
    projectId: proj,
    ts: Date.now(),
    variable: body.variable || "test_var",
    value: body.value !== undefined ? body.value : 42,
    event: body.event || "test_event",
    payload: body.payload || { message: body.message || "Test message from Raina IoT" },
  };

  const invocation: integrations.IntegrationInvocation = {
    operation: body.operation,
    params: body.params || { message: "Test notification from Raina IoT automation engine." },
  };

  const result = await integrations.executeIntegration(
    {
      id: row.id,
      project_id: row.projectId,
      name: row.name,
      kind: row.kind,
      config: decryptedConfig,
      enabled: 1, // force enable for test run
    },
    testContext,
    invocation
  );

  const now = BigInt(Date.now());
  await prisma.integration
    .update({
      where: { id: row.id },
      data: {
        lastRunAt: now,
        lastRunStatus: result.status,
        lastError: result.detail || null,
      },
    })
    .catch(() => {});

  await recordAudit({
    projectId: proj,
    userId,
    action: "integration.test",
    targetType: "integration",
    targetId: id,
    metadata: {
      status: result.status,
      detail: result.detail,
    },
  });

  return c.json({
    id,
    kind: row.kind,
    status: result.status,
    detail: result.detail,
  });
};

const validateCreate = zValidator("json", createIntegrationSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "validation_failed", issues: result.error.issues }, 400);
  }
});

const validateUpdate = zValidator("json", updateIntegrationSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "validation_failed", issues: result.error.issues }, 400);
  }
});

const integrationsRouter = new Hono()
  .get("/admin/projects/:proj/integrations", requireStaff, (c) => listIntegrationsHandler(c))
  .get("/projects/:proj/integrations", requireStaff, (c) => listIntegrationsHandler(c))
  .post("/admin/projects/:proj/integrations", requireStaff, validateCreate, (c) => createIntegrationHandler(c))
  .post("/projects/:proj/integrations", requireStaff, validateCreate, (c) => createIntegrationHandler(c))
  .patch("/admin/projects/:proj/integrations/:id", requireStaff, validateUpdate, (c) => updateIntegrationHandler(c))
  .patch("/projects/:proj/integrations/:id", requireStaff, validateUpdate, (c) => updateIntegrationHandler(c))
  .put("/projects/:proj/integrations/:id", requireStaff, validateUpdate, (c) => updateIntegrationHandler(c))
  .delete("/admin/projects/:proj/integrations/:id", requireStaff, (c) => deleteIntegrationHandler(c))
  .delete("/projects/:proj/integrations/:id", requireStaff, (c) => deleteIntegrationHandler(c))
  .post("/admin/projects/:proj/integrations/:id/test", requireStaff, zValidator("json", z.record(z.unknown()).optional()), (c) => testIntegrationHandler(c))
  .post("/projects/:proj/integrations/:id/test", requireStaff, zValidator("json", z.record(z.unknown()).optional()), (c) => testIntegrationHandler(c));

export default integrationsRouter;
