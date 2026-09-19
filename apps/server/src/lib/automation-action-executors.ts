import { prisma } from "@raina/db";
import { integrations, type AutomationGraph, type GraphNode } from "@raina/workflow";
import { nanoid } from "nanoid";
import { publishDeviceCommand } from "./emqx";
import { broadcastEvent, broadcastTelemetry } from "./events";
import { getOrCreateDefaultDevice } from "../services/telemetry.service";
import { openIntegrationConfig } from "./crypto";
import type { AutomationContext } from "./engine";

export type ActionResult = { status: "ok" | "error"; detail?: string; output?: unknown; paused?: boolean };

type ActionInput = {
  node: GraphNode;
  context: AutomationContext;
  projectId: string;
  automationId: string;
  graph: AutomationGraph;
  runId?: string;
  evaluateVariableAutomations: (projectId: string, key: string, value: unknown, deviceId: string, depth: number) => void | Promise<void>;
  triggerEventAutomations: (projectId: string, event: string, context: AutomationContext) => Promise<void>;
};

type ActionExecutor = (input: ActionInput) => Promise<ActionResult>;

const interpolationValues = (context: AutomationContext) => ({
  variable: context.variable,
  value: context.value,
  source: context.source,
  ...(context.payload || {}),
});

const interpolate = (template: string, values: Record<string, unknown>): string =>
  template.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => String(values[key] ?? ""));

const setVariable: ActionExecutor = async ({ node, context, projectId, evaluateVariableAutomations }) => {
  const variable = String(node.config?.variable || "");
  if (!variable) return { status: "error", detail: "Missing target variable" };

  let value = node.config?.value;
  if (typeof value === "string") value = interpolate(value, interpolationValues(context));
  const numericValue = Number(value);
  const parsedValue = !isNaN(numericValue) && isFinite(numericValue) ? numericValue : value;
  const storedValue = String(parsedValue);
  const now = BigInt(Date.now());
  const deviceId = context.deviceId || await getOrCreateDefaultDevice(projectId);

  await prisma.projectVariable.upsert({
    where: { projectId_deviceId_key: { projectId, deviceId, key: variable } },
    update: { value: storedValue, updatedAt: now, lastSeen: now },
    create: { id: `var_${projectId}_${deviceId}_${variable}`, projectId, deviceId, key: variable, value: storedValue, createdAt: now, updatedAt: now, lastSeen: now },
  });

  publishDeviceCommand(projectId, deviceId, { [variable]: parsedValue });
  broadcastTelemetry({ projectId, deviceId, variable, value: parsedValue, timestamp: Date.now() });

  const depth = context.depth || 0;
  if (depth < 5) evaluateVariableAutomations(projectId, variable, parsedValue, deviceId, depth + 1);

  return { status: "ok", detail: `Set ${variable} = ${storedValue}`, output: { variable, value: parsedValue, deviceId } };
};

const callIntegration: ActionExecutor = async ({ node, context, projectId }) => {
  const integrationId = String(node.config?.integration_id || node.config?.integration || "");
  if (!integrationId) return { status: "error", detail: "Missing integration_id" };

  const integration = await prisma.integration.findFirst({ where: { id: integrationId, projectId, archivedAt: null } });
  if (!integration) return { status: "error", detail: `Integration not found: ${integrationId}` };
  if (!integration.enabled) return { status: "ok", detail: "Integration skipped (disabled)" };

  const config = await openIntegrationConfig(integration.config);
  const result = await integrations.executeIntegration(
    { id: integration.id, project_id: integration.projectId, name: integration.name, kind: integration.kind, config, enabled: integration.enabled ? 1 : 0 },
    { source: context.source, projectId, ts: context.ts, variable: context.variable, value: context.value, event: context.event, payload: context.payload },
    { operation: node.config?.operation ? String(node.config.operation) : undefined, params: (node.config?.params as Record<string, unknown> | undefined) || (node.config || {}) }
  );

  await prisma.integration.update({ where: { id: integration.id }, data: { lastRunAt: BigInt(Date.now()), lastRunStatus: result.status, lastError: result.detail || null } }).catch(() => {});
  return { status: result.status === "error" ? "error" : "ok", detail: result.detail || `${integration.name} (${integration.kind}) executed`, output: result };
};

const emitEvent: ActionExecutor = async ({ node, context, projectId, triggerEventAutomations }) => {
  const event = interpolate(String(node.config?.event || "automation_event"), interpolationValues(context));
  broadcastEvent({ type: "automation_event", projectId, event, context: { variable: context.variable, value: context.value, deviceId: context.deviceId, payload: context.payload }, timestamp: Date.now() });

  const depth = context.depth || 0;
  if (depth < 3) {
    await triggerEventAutomations(projectId, event, { ...context, source: "event", event, depth: depth + 1 });
  }
  return { status: "ok", detail: `Emitted event "${event}"`, output: { event } };
};

const delay: ActionExecutor = async ({ node, context, projectId, automationId, graph, runId }) => {
  const amount = Math.max(1, Number(node.config?.delay_amount || 1));
  const unit = String(node.config?.delay_unit || "seconds");
  const delayMs = amount * (unit === "hours" ? 3_600_000 : unit === "minutes" ? 60_000 : 1_000);

  if (delayMs <= 5000 || context.isManual) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
    return { status: "ok", detail: `Waited ${amount} ${unit} (inline)` };
  }

  const outgoing = (graph.edges || []).filter((edge) => edge.from === node.id && (edge.port || "out") === "out");
  for (const edge of outgoing) {
    await prisma.automationDelay.create({
      data: { id: `dly_${nanoid(10)}`, automationId, projectId, runId: runId || null, resumeNodeId: edge.to, ctx: JSON.stringify(context), fireAt: BigInt(Date.now() + delayMs), createdAt: BigInt(Date.now()) },
    });
  }
  return { status: "ok", detail: `Scheduled resumption in ${amount} ${unit}`, paused: true, output: { fireAt: Date.now() + delayMs } };
};

export const ACTION_EXECUTORS: Readonly<Record<string, ActionExecutor>> = {
  set_variable: setVariable,
  call_integration: callIntegration,
  emit_event: emitEvent,
  delay,
};

export async function executeAction(input: ActionInput): Promise<ActionResult> {
  const executor = ACTION_EXECUTORS[input.node.kind];
  return executor ? executor(input) : { status: "ok", detail: `Block ${input.node.kind} completed` };
}
