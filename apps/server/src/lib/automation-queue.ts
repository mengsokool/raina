import { randomUUID } from "node:crypto";
import { evaluateVariableAutomations } from "./evaluator";
import { getRedisClient } from "./redis";

const STREAM = "raina:automation:evaluations";
const GROUP = "raina-automation-workers";
const DEAD_LETTER_STREAM = "raina:automation:evaluations:dead-letter";
const MAX_ATTEMPTS = 3;

export type AutomationEvaluationJob = {
  projectId: string;
  variableKey: string;
  value: unknown;
  deviceId?: string;
  depth?: number;
};

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;
const consumer = `worker-${randomUUID()}`;

export async function enqueueAutomationEvaluation(job: AutomationEvaluationJob) {
  const redis = getRedisClient();
  if (!redis) {
    await evaluateVariableAutomations(job.projectId, job.variableKey, job.value, job.deviceId, job.depth);
    return;
  }

  await redis.xAdd(STREAM, "*", { payload: JSON.stringify(job), attempt: "0" });
}

async function ensureConsumerGroup() {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await redis.xGroupCreate(STREAM, GROUP, "0", { MKSTREAM: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) throw error;
  }
  return true;
}

async function moveToDeadLetter(id: string, payload: string, attempt: number, error: unknown) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.xAdd(DEAD_LETTER_STREAM, "*", {
    sourceId: id,
    payload,
    attempt: String(attempt),
    error: error instanceof Error ? error.message.slice(0, 500) : "Unknown automation worker error",
    failedAt: String(Date.now()),
  });
}

async function processMessage(id: string, fields: Record<string, string>) {
  const redis = getRedisClient();
  if (!redis) return;
  const payload = fields.payload;
  const attempt = Number(fields.attempt || "0");
  if (!payload) {
    await moveToDeadLetter(id, "", attempt, new Error("Missing automation job payload"));
    await redis.xAck(STREAM, GROUP, id);
    return;
  }
  try {
    const job = JSON.parse(payload) as AutomationEvaluationJob;
    if (!job.projectId || !job.variableKey) throw new Error("Invalid automation job payload");
    await evaluateVariableAutomations(job.projectId, job.variableKey, job.value, job.deviceId, job.depth);
    await redis.xAck(STREAM, GROUP, id);
  } catch (error) {
    if (attempt + 1 >= MAX_ATTEMPTS) await moveToDeadLetter(id, payload, attempt + 1, error);
    else await redis.xAdd(STREAM, "*", { payload, attempt: String(attempt + 1) });
    await redis.xAck(STREAM, GROUP, id);
  }
}

async function consumeBatch() {
  const redis = getRedisClient();
  if (!redis || !(await ensureConsumerGroup())) return;
  const claimed = await redis.xAutoClaim(STREAM, GROUP, consumer, 30_000, "0-0", { COUNT: 25 });
  for (const message of claimed.messages || []) await processMessage(message.id, message.message as Record<string, string>);
  const batches = await redis.xReadGroup(GROUP, consumer, [{ key: STREAM, id: ">" }], { COUNT: 25, BLOCK: 1000 });
  for (const batch of batches || []) for (const message of batch.messages) await processMessage(message.id, message.message as Record<string, string>);
}

export function initAutomationWorker() {
  if (workerTimer) return;
  const tick = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try { await consumeBatch(); }
    catch (error) { console.error("[Automation Worker] Redis stream processing failed:", error); }
    finally { workerRunning = false; }
  };
  void tick();
  workerTimer = setInterval(() => void tick(), 1500);
  console.log("[Automation Worker] Redis Streams consumer started");
}

export function closeAutomationWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

export async function getAutomationQueueStatus() {
  const redis = getRedisClient();
  if (!redis) return { available: false, queued: null, pending: null, deadLetter: null };
  try {
    const [queued, deadLetter, pending] = await Promise.all([
      redis.xLen(STREAM),
      redis.xLen(DEAD_LETTER_STREAM),
      redis.xPending(STREAM, GROUP).then((result) => result.pending).catch(() => 0),
    ]);
    return { available: true, queued, pending, deadLetter };
  } catch {
    return { available: false, queued: null, pending: null, deadLetter: null };
  }
}
