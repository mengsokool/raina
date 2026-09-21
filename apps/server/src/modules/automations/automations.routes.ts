import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@raina/db";
import { nanoid } from "nanoid";
import { blocks } from "@raina/workflow";
import { requireStaff } from "../../lib/auth";
import { executeAutomation } from "../../lib/engine";
import { getRequiredParam } from "../../lib/params";
import { generateAutomationDraft } from "./automation-draft.service";
import { config } from "../../config";

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateGraph(graph: unknown): string | null {
  if (!graph || typeof graph !== "object") return "A workflow graph is required.";
  const candidate = graph as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return "Workflow nodes and connections must be arrays.";
  const structuralError = blocks.graphError(candidate as blocks.AutomationGraph);
  if (structuralError) return structuralError;
  for (const node of candidate.nodes as blocks.GraphNode[]) {
    const manifest = blocks.findBlock(node.kind);
    if (!manifest) return `Unknown block kind: ${node.kind}`;
    const config = node.config ?? {};
    for (const field of manifest.fields) {
      const value = config[field.key];
      if (field.required && (value === undefined || value === null || value === "")) return `${manifest.label}: ${field.label} is required.`;
      if (value === undefined || value === null || value === "") continue;
      if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return `${manifest.label}: ${field.label} must be a number.`;
      if (field.type === "boolean" && typeof value !== "boolean") return `${manifest.label}: ${field.label} must be true or false.`;
      if (field.type === "time" && (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return `${manifest.label}: ${field.label} must use HH:MM.`;
      if (field.type === "weekdays" && (!Array.isArray(value) || value.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) return `${manifest.label}: ${field.label} contains an invalid day.`;
      if (field.type === "select" && field.options && (typeof value !== "string" || !field.options.includes(value))) return `${manifest.label}: ${field.label} has an invalid option.`;
    }
  }
  return null;
}

function deriveTriggerType(graphData: any, fallback = "variable_changed"): string {
  if (Array.isArray(graphData?.nodes)) {
    const trig = graphData.nodes.find((n: any) => blocks.findBlock(n.kind)?.category === "trigger");
    if (trig) return trig.kind;
  }
  return fallback;
}

function safeJson(str: string | null | undefined): any {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}

const mapAutomation = (a: any) => {
  let parsedGraph: any = { nodes: [], edges: [] };
  try { parsedGraph = JSON.parse(a.graph); } catch {}
  return {
    id: a.id, name: a.name, description: a.description, enabled: a.enabled,
    trigger_type: a.triggerType, trigger_config: parsedGraph.triggerConfig || {},
    actions: parsedGraph.actions || [], graph: parsedGraph,
    created_at: Number(a.createdAt), updated_at: Number(a.updatedAt),
    last_run_at: a.lastRunAt ? Number(a.lastRunAt) : null,
    last_run_status: a.lastRunStatus || null, last_error: a.lastError || null,
  };
};

// ── Schemas ───────────────────────────────────────────────────────────────────
const automationInput = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  trigger_type: z.string().optional(),
  trigger_config: z.record(z.unknown()).optional(),
  actions: z.array(z.unknown()).optional(),
  graph: z.record(z.unknown()).optional(),
});
const draftInput = z.object({
  prompt: z.string().trim().min(8).max(1000),
  timezone: z.string().min(1).max(100),
});

// ── Typed route chain ─────────────────────────────────────────────────────────
const automationsRouter = new Hono()
  .post("/admin/projects/:proj/automations/draft", requireStaff, zValidator("json", draftInput), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const { prompt, timezone } = c.req.valid("json");
    const apiKey = config.typesafeApiKey;
    if (!apiKey) return c.json({ error: "TypeSafe is not configured. Set TYPESAFE_API_KEY on the server." }, 503);
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { return c.json({ error: "Invalid timezone." }, 400); }

    const project = await prisma.project.findUnique({ where: { id: proj }, select: { id: true } });
    if (!project) return c.json({ error: "Project not found." }, 404);
    const [variables, integrations] = await Promise.all([
      prisma.projectVariable.findMany({
        where: { projectId: proj },
        include: { device: { select: { name: true } } },
        orderBy: { key: "asc" },
      }),
      prisma.integration.findMany({
        where: { projectId: proj, archivedAt: null, enabled: true },
        select: { id: true, name: true, kind: true },
        orderBy: { name: "asc" },
      }),
    ]);
    try {
      const draft = await generateAutomationDraft(prompt, timezone, {
        variables: variables.map((v) => ({ id: v.id, key: v.key, deviceId: v.deviceId, deviceName: v.device.name, unit: v.unit, value: v.value })),
        integrations,
      }, apiKey);
      return c.json(draft);
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "TypeSafe timed out. Try again."
        : error instanceof Error ? error.message : "Could not generate a draft.";
      return c.json({ error: message }, 502);
    }
  })
  .get("/admin/projects/:proj/automations", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const automations = await prisma.automation.findMany({ where: { projectId: proj }, orderBy: { createdAt: "desc" } });
    return c.json(automations.map(mapAutomation));
  })
  .post("/admin/projects/:proj/automations", requireStaff, zValidator("json", automationInput), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const body = c.req.valid("json");
    const now = BigInt(Date.now());
    const graphData = body.graph || { triggerConfig: body.trigger_config || {}, actions: body.actions || [], nodes: [], edges: [] };
    const graphError = validateGraph(graphData);
    if (graphError) return c.json({ error: "invalid_graph", message: graphError }, 400);
    const derivedTrigger = deriveTriggerType(graphData, body.trigger_type);
    const automation = await prisma.automation.create({
      data: { id: `atm_${nanoid(10)}`, projectId: proj, name: body.name || "New Automation", description: body.description ?? null, triggerType: derivedTrigger, graph: JSON.stringify(graphData), enabled: body.enabled !== undefined ? Boolean(body.enabled) : true, createdAt: now, updatedAt: now },
    });
    return c.json(mapAutomation(automation), 201);
  })
  .patch("/admin/projects/:proj/automations/:id", requireStaff, zValidator("json", automationInput), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const body = c.req.valid("json");
    const now = BigInt(Date.now());
    const existing = await prisma.automation.findFirst({ where: { id, projectId: proj } });
    if (!existing) return c.json({ error: "not_found" }, 404);
    let graphStr: string | undefined;
    let derivedTrigger = body.trigger_type;
    if (body.graph) {
      const graphError = validateGraph(body.graph);
      if (graphError) return c.json({ error: "invalid_graph", message: graphError }, 400);
      graphStr = JSON.stringify(body.graph);
      derivedTrigger = deriveTriggerType(body.graph, existing.triggerType);
    } else if (body.actions || body.trigger_config) {
      let oldGraph: any = {};
      try { oldGraph = JSON.parse(existing.graph); } catch {}
      if (body.actions) oldGraph.actions = body.actions;
      if (body.trigger_config) oldGraph.triggerConfig = body.trigger_config;
      graphStr = JSON.stringify(oldGraph);
    }
    const updated = await prisma.automation.update({
      where: { id },
      data: { ...(body.name ? { name: body.name } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}), ...(derivedTrigger ? { triggerType: derivedTrigger } : {}), ...(graphStr ? { graph: graphStr } : {}), updatedAt: now },
    });
    return c.json({ id: updated.id, name: updated.name, description: updated.description, enabled: updated.enabled, trigger_type: updated.triggerType, updated_at: Number(updated.updatedAt) });
  })
  .delete("/admin/projects/:proj/automations/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const existing = await prisma.automation.findFirst({ where: { id, projectId: proj } });
    if (!existing) return c.json({ error: "not_found" }, 404);
    await prisma.automation.delete({ where: { id } });
    return c.json({ success: true, id });
  })
  .post(
    "/admin/projects/:proj/automations/:id/run",
    requireStaff,
    zValidator(
      "json",
      z
        .object({
          variable: z.string().optional(),
          value: z.unknown().optional(),
          isManual: z.boolean().optional(),
          payload: z.record(z.unknown()).optional(),
        })
        .optional()
    ),
    async (c) => {
      const proj = getRequiredParam(c, "proj");
      const id = getRequiredParam(c, "id");
      const body = (c.req.valid("json") || {}) as {
        variable?: string;
        value?: unknown;
        isManual?: boolean;
        payload?: Record<string, unknown>;
      };
      const existing = await prisma.automation.findFirst({ where: { id, projectId: proj } });
      if (!existing) return c.json({ error: "not_found" }, 404);
      const result = await executeAutomation(existing, {
        source: "manual",
        projectId: proj,
        ts: Date.now(),
        variable: body.variable,
        value: body.value,
        isManual: true,
        payload: body.payload,
      });
      return c.json({
        id,
        run_id: result.runId,
        status: result.status,
        stepsExecuted: result.stepsExecuted,
        logs: result.logs,
        error: result.error,
      });
    }
  )
  .get(
    "/admin/projects/:proj/automations/:id/runs",
    requireStaff,
    zValidator("query", z.object({ limit: z.string().optional() })),
    async (c) => {
      const proj = getRequiredParam(c, "proj");
      const id = getRequiredParam(c, "id");
      const query = c.req.valid("query");
      const limit = Math.min(100, Math.max(1, Number(query.limit || 30)));
      const runs = await prisma.automationRun.findMany({
        where: { automationId: id, projectId: proj },
        orderBy: { startedAt: "desc" },
        take: limit,
        include: { _count: { select: { steps: true } } },
      });
      return c.json(
        runs.map((r) => ({
          id: r.id,
          automation_id: r.automationId,
          project_id: r.projectId,
          status: r.status,
          trigger_source: r.triggerSource,
          trigger_context: safeJson(r.triggerContext),
          error: r.error,
          started_at: Number(r.startedAt),
          finished_at: r.finishedAt ? Number(r.finishedAt) : null,
          duration_ms: r.durationMs,
          steps_count: r._count.steps,
        }))
      );
    }
  )
  .get("/admin/projects/:proj/automations/:id/runs/:runId", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const runId = getRequiredParam(c, "runId");
    const run = await prisma.automationRun.findFirst({ where: { id: runId, automationId: id, projectId: proj }, include: { steps: { orderBy: { startedAt: "asc" } } } });
    if (!run) return c.json({ error: "not_found" }, 404);
    return c.json({ id: run.id, automation_id: run.automationId, project_id: run.projectId, status: run.status, trigger_source: run.triggerSource, trigger_context: safeJson(run.triggerContext), error: run.error, started_at: Number(run.startedAt), finished_at: run.finishedAt ? Number(run.finishedAt) : null, duration_ms: run.durationMs, steps: run.steps.map((s) => ({ id: s.id, node_id: s.nodeId, node_kind: s.nodeKind, category: s.category, status: s.status, input: safeJson(s.input), output: safeJson(s.output), error: s.error, retry_count: s.retryCount, started_at: Number(s.startedAt), finished_at: s.finishedAt ? Number(s.finishedAt) : null, duration_ms: s.durationMs })) });
  })
  .post("/admin/projects/:proj/automations/:id/runs/:runId/retry", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const runId = getRequiredParam(c, "runId");
    const existingAuto = await prisma.automation.findFirst({ where: { id, projectId: proj } });
    if (!existingAuto) return c.json({ error: "not_found", message: "Automation not found" }, 404);
    const existingRun = await prisma.automationRun.findFirst({ where: { id: runId, automationId: id, projectId: proj }, include: { steps: true } });
    if (!existingRun) return c.json({ error: "not_found", message: "Run not found" }, 404);
    let ctx: any = { source: "manual", projectId: proj, ts: Date.now() };
    try { ctx = JSON.parse(existingRun.triggerContext); } catch {}
    const failedStep = existingRun.steps.find((s) => s.status === "failed");
    const result = await executeAutomation(existingAuto, ctx, { runId: existingRun.id, startNodeId: failedStep?.nodeId });
    return c.json({ run_id: result.runId, status: result.status, steps_executed: result.stepsExecuted, logs: result.logs, error: result.error });
  })
  // Alias paths for backward compat
  .get("/projects/:proj/automations", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const automations = await prisma.automation.findMany({ where: { projectId: proj }, orderBy: { createdAt: "desc" } });
    return c.json(automations.map(mapAutomation));
  })
  .post("/projects/:proj/automations", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const body = await c.req.json();
    const now = BigInt(Date.now());
    const graphData = body.graph || { triggerConfig: body.trigger_config || {}, actions: body.actions || [], nodes: [], edges: [] };
    const graphError = validateGraph(graphData);
    if (graphError) return c.json({ error: "invalid_graph", message: graphError }, 400);
    const automation = await prisma.automation.create({ data: { id: `atm_${nanoid(10)}`, projectId: proj, name: body.name || "New Automation", description: body.description ?? null, triggerType: deriveTriggerType(graphData, body.trigger_type), graph: JSON.stringify(graphData), enabled: body.enabled !== undefined ? Boolean(body.enabled) : true, createdAt: now, updatedAt: now } });
    return c.json(mapAutomation(automation), 201);
  })
  .patch("/projects/:proj/automations/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const body = await c.req.json();
    const now = BigInt(Date.now());
    const existing = await prisma.automation.findFirst({ where: { id, projectId: proj } });
    if (!existing) return c.json({ error: "not_found" }, 404);
    let graphStr: string | undefined;
    let derivedTrigger = body.trigger_type;
    if (body.graph) { const ge = validateGraph(body.graph); if (ge) return c.json({ error: "invalid_graph", message: ge }, 400); graphStr = JSON.stringify(body.graph); derivedTrigger = deriveTriggerType(body.graph, existing.triggerType); }
    const updated = await prisma.automation.update({ where: { id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}), ...(derivedTrigger ? { triggerType: derivedTrigger } : {}), ...(graphStr ? { graph: graphStr } : {}), updatedAt: now } });
    return c.json({ id: updated.id, name: updated.name, enabled: updated.enabled, trigger_type: updated.triggerType, updated_at: Number(updated.updatedAt) });
  })
  .delete("/projects/:proj/automations/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const existing = await prisma.automation.findFirst({ where: { id, projectId: proj } });
    if (!existing) return c.json({ error: "not_found" }, 404);
    await prisma.automation.delete({ where: { id } });
    return c.json({ success: true, id });
  });

export default automationsRouter;
