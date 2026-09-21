import { prisma } from "@raina/db";
import { blocks } from "@raina/workflow";
import { nanoid } from "nanoid";
import { broadcastEvent } from "./events";
import { evaluateVariableAutomations } from "./evaluator";
import { executeCondition } from "./automation-condition-executors";
import { executeAction } from "./automation-action-executors";

export interface AutomationContext {
  source: "telemetry" | "event" | "schedule" | "manual" | "delay_resume" | "control";
  projectId: string;
  ts: number;
  variable?: string;
  value?: unknown;
  deviceId?: string;
  event?: string;
  payload?: Record<string, unknown>;
  isManual?: boolean;
  depth?: number;
}

export interface StepLog {
  nodeId: string;
  nodeKind: string;
  category: "trigger" | "condition" | "action";
  status: "ok" | "failed" | "skipped" | "paused";
  detail?: string;
  output?: unknown;
  retryCount?: number;
  durationMs: number;
}

export interface AutomationExecutionResult {
  runId?: string;
  automationId: string;
  status: "ok" | "error" | "skipped" | "paused";
  stepsExecuted: number;
  logs: StepLog[];
  error?: string;
}

export interface ExecuteAutomationOptions {
  runId?: string;
  startNodeId?: string;
  maxRetries?: number;
}

/**
 * Retry helper with exponential backoff and jitter for transient action failures.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    initialDelayMs?: number;
    factor?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<{ result: T; attempts: number }> {
  const maxRetries = Math.max(1, opts.maxRetries ?? 3);
  const initialDelayMs = opts.initialDelayMs ?? 150;
  const factor = opts.factor ?? 2;
  const maxDelayMs = opts.maxDelayMs ?? 2000;

  let attempt = 0;
  while (true) {
    try {
      attempt++;
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err: any) {
      if (attempt >= maxRetries) {
        throw err;
      }
      opts.onRetry?.(attempt, err);
      const delay = Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      const jitter = Math.random() * 30;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
}

/**
 * Executes an automation workflow against a given context with Durable Execution.
 * Guarantees step checkpointing, crash resumption, automatic retries, and execution auditing.
 */
export async function executeAutomation(
  automation: {
    id: string;
    projectId: string;
    graph: string;
    lastRunAt?: bigint | null;
    enabled?: boolean;
  },
  ctx: AutomationContext,
  optionsOrStartNodeId?: string | ExecuteAutomationOptions
): Promise<AutomationExecutionResult> {
  const startTime = Date.now();
  const logs: StepLog[] = [];

  const options: ExecuteAutomationOptions =
    typeof optionsOrStartNodeId === "string"
      ? { startNodeId: optionsOrStartNodeId }
      : optionsOrStartNodeId || {};

  const startNodeId = options.startNodeId;
  const maxRetries = options.maxRetries ?? 3;

  let graph: blocks.AutomationGraph;
  try {
    graph = JSON.parse(automation.graph);
  } catch (err: any) {
    return {
      automationId: automation.id,
      status: "error",
      stepsExecuted: 0,
      logs: [],
      error: `Failed to parse automation graph: ${err.message}`,
    };
  }

  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return {
      automationId: automation.id,
      status: "skipped",
      stepsExecuted: 0,
      logs: [],
      error: "No nodes in automation graph",
    };
  }

  // Determine entry points
  let entryNodes: blocks.GraphNode[] = [];
  if (startNodeId) {
    const target = graph.nodes.find((n) => n.id === startNodeId);
    if (target) entryNodes = [target];
  } else {
    // Determine matching trigger nodes
    entryNodes = graph.nodes.filter((node) => {
      const manifest = blocks.findBlock(node.kind);
      if (manifest?.category !== "trigger") return false;

      if (ctx.isManual || ctx.source === "manual") {
        return true;
      }

      switch (node.kind) {
        case "variable":
        case "variable_changed": {
          if (ctx.source !== "telemetry" && ctx.source !== "delay_resume" && ctx.source !== "control") return false;
          const targetVar = node.config?.variable;
          if (!targetVar || targetVar !== ctx.variable) return false;

          if (node.config?.device && ctx.deviceId && node.config.device !== ctx.deviceId) {
            return false;
          }

          const cooldownSec = Number(node.config?.cooldown_seconds || 0);
          if (cooldownSec > 0 && automation.lastRunAt) {
            const elapsed = Date.now() - Number(automation.lastRunAt);
            if (elapsed < cooldownSec * 1000) {
              return false;
            }
          }

          const op = String(node.config?.operator || "changed");
          const targetVal = node.config?.value;
          return evaluateOperator(ctx.value, op, targetVal);
        }

        case "event": {
          if (ctx.source !== "event") return false;
          const targetEvent = String(node.config?.event || "");
          return targetEvent === ctx.event;
        }

        case "schedule": {
          if (ctx.source !== "schedule") return false;
          return isScheduleMatching(node.config);
        }

        case "sunset_sunrise": {
          if (ctx.source !== "schedule") return false;
          return isSolarMatching(node.config);
        }

        case "manual": {
          return true;
        }

        default:
          return false;
      }
    });
  }

  if (entryNodes.length === 0) {
    return {
      automationId: automation.id,
      status: "skipped",
      stepsExecuted: 0,
      logs: [],
    };
  }

  // Durable Execution: Initialize or Resume AutomationRun
  let runId = options.runId;
  const existingStepMap = new Map<string, any>();

  if (runId) {
    const existingRun = await prisma?.automationRun?.findUnique({
      where: { id: runId },
      include: { steps: true },
    }).catch(() => null);
    if (existingRun) {
      for (const step of existingRun.steps) {
        existingStepMap.set(step.nodeId, step);
      }
      await prisma?.automationRun?.update({
        where: { id: runId },
        data: { status: "running", error: null },
      }).catch(() => {});
    }
  }

  if (!runId) {
    runId = `run_${nanoid(12)}`;
    try {
      await prisma?.automationRun?.create({
        data: {
          id: runId,
          automationId: automation.id,
          projectId: automation.projectId,
          status: "running",
          triggerSource: ctx.source,
          triggerContext: JSON.stringify(ctx),
          startedAt: BigInt(startTime),
        },
      });
    } catch (err) {
      console.error("[Durable Engine] Failed to create AutomationRun:", err);
    }
  }

  // Enqueue initial nodes
  const queue: Array<{ node: blocks.GraphNode; fromNodeId?: string }> = [];
  const visited = new Set<string>();

  for (const entry of entryNodes) {
    const stepStart = Date.now();
    const manifest = blocks.findBlock(entry.kind);
    const category = manifest?.category || "trigger";

    // Step checkpoint for trigger
    let existingTriggerStep = existingStepMap.get(entry.id);
    if (!existingTriggerStep) {
      try {
        existingTriggerStep = await prisma?.automationStepRun?.create({
          data: {
            id: `step_${nanoid(12)}`,
            runId: runId!,
            nodeId: entry.id,
            nodeKind: entry.kind,
            category,
            status: "completed",
            input: JSON.stringify(entry.config || {}),
            output: JSON.stringify({ source: ctx.source, variable: ctx.variable, value: ctx.value }),
            startedAt: BigInt(stepStart),
            finishedAt: BigInt(Date.now()),
            durationMs: Math.max(0, Date.now() - stepStart),
          },
        });
      } catch {}
    }

    logs.push({
      nodeId: entry.id,
      nodeKind: entry.kind,
      category: "trigger",
      status: "ok",
      detail: `Triggered by ${ctx.source}`,
      durationMs: Date.now() - startTime,
    });

    if (startNodeId) {
      queue.push({ node: entry });
    } else {
      const edges = (graph.edges || []).filter(
        (e) => e.from === entry.id && (e.port || "out") === "out"
      );
      for (const edge of edges) {
        const targetNode = graph.nodes.find((n) => n.id === edge.to);
        if (targetNode) {
          queue.push({ node: targetNode, fromNodeId: entry.id });
        }
      }
    }
  }

  let stepsExecuted = logs.length;
  let isPaused = false;
  let hasFailure = false;
  let executionError: string | undefined = undefined;

  while (queue.length > 0 && !isPaused && !hasFailure) {
    const { node } = queue.shift()!;
    const nodeKey = `${node.id}`;
    if (visited.has(nodeKey)) continue;
    visited.add(nodeKey);

    const nodeStart = Date.now();
    const manifest = blocks.findBlock(node.kind);
    const category = (manifest?.category || "action") as "condition" | "action";

    // Check if step was already completed in this run (Idempotent Replay / Crash Recovery)
    const existingStep = existingStepMap.get(node.id);
    if (existingStep && existingStep.status === "completed" && node.id !== startNodeId) {
      let savedOutput: any = null;
      try {
        savedOutput = existingStep.output ? JSON.parse(existingStep.output) : null;
      } catch {}

      logs.push({
        nodeId: node.id,
        nodeKind: node.kind,
        category,
        status: "ok",
        detail: `Replayed from checkpoint`,
        output: savedOutput,
        durationMs: existingStep.durationMs || 0,
      });
      stepsExecuted++;

      // Traverse next nodes based on saved output
      if (category === "condition") {
        const conditionBool = Boolean(savedOutput);
        const branchPort = conditionBool ? "true" : "false";
        const outgoingEdges = (graph.edges || []).filter(
          (e) =>
            e.from === node.id &&
            (e.port === branchPort ||
              (conditionBool && (e.port === "yes" || e.port === "out")) ||
              (!conditionBool && e.port === "no"))
        );
        for (const edge of outgoingEdges) {
          const target = graph.nodes.find((n) => n.id === edge.to);
          if (target) queue.push({ node: target, fromNodeId: node.id });
        }
      } else {
        const outgoingEdges = (graph.edges || []).filter(
          (e) => e.from === node.id && (e.port || "out") === "out"
        );
        for (const edge of outgoingEdges) {
          const target = graph.nodes.find((n) => n.id === edge.to);
          if (target) queue.push({ node: target, fromNodeId: node.id });
        }
      }
      continue;
    }

    // New or retried step execution: Record running step
    let stepRecordId = existingStep?.id || `step_${nanoid(12)}`;
    try {
      if (existingStep) {
        await prisma?.automationStepRun?.update({
          where: { id: existingStep.id },
          data: {
            status: "running",
            startedAt: BigInt(nodeStart),
            error: null,
          },
        });
      } else {
        await prisma?.automationStepRun?.create({
          data: {
            id: stepRecordId,
            runId: runId!,
            nodeId: node.id,
            nodeKind: node.kind,
            category,
            status: "running",
            input: JSON.stringify(node.config || {}),
            startedAt: BigInt(nodeStart),
          },
        });
      }
    } catch {}

    try {
      if (category === "condition") {
        const conditionResult = await evaluateConditionNode(node, ctx, automation.projectId);
        const duration = Date.now() - nodeStart;
        stepsExecuted++;

        logs.push({
          nodeId: node.id,
          nodeKind: node.kind,
          category: "condition",
          status: "ok",
          output: conditionResult,
          detail: `Branch: ${conditionResult ? "true" : "false"}`,
          durationMs: duration,
        });

        // Checkpoint condition step completion
        await prisma?.automationStepRun?.update({
          where: { id: stepRecordId },
          data: {
            status: "completed",
            output: JSON.stringify(conditionResult),
            durationMs: duration,
            finishedAt: BigInt(Date.now()),
          },
        }).catch(() => {});

        const branchPort = conditionResult ? "true" : "false";
        const outgoingEdges = (graph.edges || []).filter(
          (e) =>
            e.from === node.id &&
            (e.port === branchPort ||
              (conditionResult && (e.port === "yes" || e.port === "out")) ||
              (!conditionResult && e.port === "no"))
        );

        for (const edge of outgoingEdges) {
          const target = graph.nodes.find((n) => n.id === edge.to);
          if (target) {
            queue.push({ node: target, fromNodeId: node.id });
          }
        }
      } else {
        // Execute Action with Automatic Retries
        let actionResult: { status: "ok" | "error"; detail?: string; output?: unknown; paused?: boolean };
        let attemptsCount = 1;

        if (node.kind === "call_integration") {
          const retryOutcome = await retryWithBackoff(
            async () => {
              const res = await executeActionNode(node, ctx, automation.projectId, automation.id, graph, runId);
              if (res.status === "error") {
                throw new Error(res.detail || "Integration call returned error");
              }
              return res;
            },
            { maxRetries }
          );
          actionResult = retryOutcome.result;
          attemptsCount = retryOutcome.attempts;
        } else {
          actionResult = await executeActionNode(node, ctx, automation.projectId, automation.id, graph, runId);
        }

        const duration = Date.now() - nodeStart;
        stepsExecuted++;

        if (actionResult.paused) {
          isPaused = true;
          logs.push({
            nodeId: node.id,
            nodeKind: node.kind,
            category: "action",
            status: "paused",
            detail: actionResult.detail,
            output: actionResult.output,
            durationMs: duration,
          });

          await prisma?.automationStepRun?.update({
            where: { id: stepRecordId },
            data: {
              status: "completed",
              output: JSON.stringify(actionResult.output || { paused: true }),
              durationMs: duration,
              finishedAt: BigInt(Date.now()),
            },
          }).catch(() => {});
        } else if (actionResult.status === "error") {
          hasFailure = true;
          executionError = actionResult.detail || "Action execution failed";
          logs.push({
            nodeId: node.id,
            nodeKind: node.kind,
            category: "action",
            status: "failed",
            detail: actionResult.detail,
            retryCount: attemptsCount - 1,
            durationMs: duration,
          });

          await prisma?.automationStepRun?.update({
            where: { id: stepRecordId },
            data: {
              status: "failed",
              error: actionResult.detail || "Action execution failed",
              retryCount: attemptsCount - 1,
              durationMs: duration,
              finishedAt: BigInt(Date.now()),
            },
          }).catch(() => {});
        } else {
          logs.push({
            nodeId: node.id,
            nodeKind: node.kind,
            category: "action",
            status: "ok",
            detail: actionResult.detail,
            output: actionResult.output,
            retryCount: attemptsCount - 1,
            durationMs: duration,
          });

          await prisma?.automationStepRun?.update({
            where: { id: stepRecordId },
            data: {
              status: "completed",
              output: JSON.stringify(actionResult.output || {}),
              retryCount: attemptsCount - 1,
              durationMs: duration,
              finishedAt: BigInt(Date.now()),
            },
          }).catch(() => {});

          const outgoingEdges = (graph.edges || []).filter(
            (e) => e.from === node.id && (e.port || "out") === "out"
          );
          for (const edge of outgoingEdges) {
            const target = graph.nodes.find((n) => n.id === edge.to);
            if (target) {
              queue.push({ node: target, fromNodeId: node.id });
            }
          }
        }
      }
    } catch (err: any) {
      const duration = Date.now() - nodeStart;
      hasFailure = true;
      executionError = err.message;
      stepsExecuted++;

      logs.push({
        nodeId: node.id,
        nodeKind: node.kind,
        category,
        status: "failed",
        detail: err.message,
        durationMs: duration,
      });

      await prisma?.automationStepRun?.update({
        where: { id: stepRecordId },
        data: {
          status: "failed",
          error: err.message,
          durationMs: duration,
          finishedAt: BigInt(Date.now()),
        },
      }).catch(() => {});
    }
  }

  const now = BigInt(Date.now());
  const totalDuration = Date.now() - startTime;
  const finalStatus = isPaused ? "paused" : hasFailure ? "error" : "ok";
  const runStatus = isPaused ? "paused" : hasFailure ? "failed" : "completed";
  const lastError = hasFailure ? executionError || "Execution failed" : null;

  // Checkpoint overall AutomationRun status
  if (runId) {
    await prisma?.automationRun?.update({
      where: { id: runId },
      data: {
        status: runStatus,
        error: lastError,
        durationMs: totalDuration,
        finishedAt: isPaused ? null : now,
      },
    }).catch(() => {});
  }

  // Update Automation table summary
  await prisma?.automation?.update({
    where: { id: automation.id },
    data: {
      lastRunAt: now,
      lastRunStatus: finalStatus,
      lastError,
    },
  }).catch(() => {});

  return {
    runId,
    automationId: automation.id,
    status: finalStatus,
    stepsExecuted,
    logs,
    error: lastError || undefined,
  };
}

async function evaluateConditionNode(
  node: blocks.GraphNode,
  ctx: AutomationContext,
  projectId: string
): Promise<boolean> {
  return executeCondition(node, {
    context: ctx,
    projectId,
    evaluateOperator,
    isTimeInWindow,
    readVariable: async (key) => {
      if (!key) return undefined;
      const row = await prisma.projectVariable.findFirst({
        where: { projectId, key },
        orderBy: { updatedAt: "desc" },
      });
      if (!row || row.value === null) return undefined;
      const numberValue = Number(row.value);
      return !isNaN(numberValue) && isFinite(numberValue) ? numberValue : row.value;
    },
  });
}

export async function executeActionNode(
  node: blocks.GraphNode,
  ctx: AutomationContext,
  projectId: string,
  automationId: string,
  graph: blocks.AutomationGraph,
  runId?: string
) {
  return executeAction({
    node,
    context: ctx,
    projectId,
    automationId,
    graph,
    runId,
    evaluateVariableAutomations,
    triggerEventAutomations,
  });
}

export async function triggerEventAutomations(
  projectId: string,
  eventName: string,
  ctx: AutomationContext
) {
  try {
    const automations = await prisma.automation.findMany({
      where: { projectId, enabled: true },
    });

    for (const auto of automations) {
      void executeAutomation(auto, {
        ...ctx,
        source: "event",
        event: eventName,
      });
    }
  } catch (err) {
    console.error("[Trigger Event Automations Error]:", err);
  }
}

export function evaluateOperator(current: unknown, operator: string, target: unknown): boolean {
  const op = (operator || "").trim();
  if (op === "changed" || !op) return true;

  const normalizedOp = op === "=" ? "==" : op;

  const toNumericOrBoolean = (val: unknown): number | null => {
    if (val === true || val === "true" || val === "on" || val === "ON" || val === "TRUE") return 1;
    if (val === false || val === "false" || val === "off" || val === "OFF" || val === "FALSE") return 0;
    const n = Number(val);
    if (!isNaN(n) && isFinite(n) && val !== "" && val !== null && val !== undefined) {
      return n;
    }
    return null;
  };

  const curNum = toNumericOrBoolean(current);
  const tgtNum = toNumericOrBoolean(target);

  if (curNum !== null && tgtNum !== null) {
    switch (normalizedOp) {
      case ">": return curNum > tgtNum;
      case "<": return curNum < tgtNum;
      case ">=": return curNum >= tgtNum;
      case "<=": return curNum <= tgtNum;
      case "==": return curNum === tgtNum;
      case "!=": return curNum !== tgtNum;
      default: return false;
    }
  }

  const curStr = String(current ?? "").trim().toLowerCase();
  const tgtStr = String(target ?? "").trim().toLowerCase();

  switch (normalizedOp) {
    case "==": return curStr === tgtStr;
    case "!=": return curStr !== tgtStr;
    default: return false;
  }
}

function isTimeInWindow(config: Record<string, unknown>): boolean {
  const fromStr = String(config.from || "09:00");
  const toStr = String(config.to || "17:00");
  const days = Array.isArray(config.days) ? config.days : [];
  const tz = config.tz ? String(config.tz) : undefined;

  const now = new Date();
  let currentHour = now.getHours();
  let currentMinute = now.getMinutes();
  let currentDay = now.getDay();

  if (tz) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hPart = parts.find((p) => p.type === "hour");
      const mPart = parts.find((p) => p.type === "minute");
      if (hPart && mPart) {
        currentHour = parseInt(hPart.value, 10);
        currentMinute = parseInt(mPart.value, 10);
      }
    } catch {}
  }

  if (days.length > 0 && !days.includes(currentDay)) {
    return false;
  }

  const [fromH, fromM] = fromStr.split(":").map(Number);
  const [toH, toM] = toStr.split(":").map(Number);

  const curTotal = currentHour * 60 + currentMinute;
  const fromTotal = (fromH || 0) * 60 + (fromM || 0);
  const toTotal = (toH || 0) * 60 + (toM || 0);

  if (fromTotal <= toTotal) {
    return curTotal >= fromTotal && curTotal <= toTotal;
  } else {
    return curTotal >= fromTotal || curTotal <= toTotal;
  }
}

export function isScheduleMatching(config?: Record<string, unknown>): boolean {
  if (!config) return false;
  const timeStr = String(config.time || "08:00");
  const days = Array.isArray(config.days) ? config.days : [];
  const tz = config.tz ? String(config.tz) : undefined;

  const now = new Date();
  let currentHour = now.getHours();
  let currentMinute = now.getMinutes();
  let currentDay = now.getDay();

  if (tz) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const h = parts.find((p) => p.type === "hour");
      const m = parts.find((p) => p.type === "minute");
      if (h && m) {
        currentHour = parseInt(h.value, 10);
        currentMinute = parseInt(m.value, 10);
      }
    } catch {}
  }

  if (days.length > 0 && !days.includes(currentDay)) {
    return false;
  }

  const [schedH, schedM] = timeStr.split(":").map(Number);
  return currentHour === schedH && currentMinute === schedM;
}

export function isSolarMatching(config?: Record<string, unknown>): boolean {
  if (!config) return false;
  const event = String(config.event || "sunset");
  const offsetMin = Number(config.offset_minutes || 0);

  const now = new Date();
  const targetHour = event === "sunrise" ? 6 : 18;
  const targetMinute = (0 + offsetMin) % 60;

  return now.getHours() === targetHour && now.getMinutes() === targetMinute;
}

function interpolate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
