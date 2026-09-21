import { prisma } from "@raina/db";
import { blocks } from "@raina/workflow";
import { executeAutomation, isScheduleMatching, isSolarMatching } from "../lib/engine";
import { withDistributedLock } from "../lib/redis";

let schedulerTimer: NodeJS.Timeout | null = null;
let isTicking = false;
let lastRetentionCleanup = 0;
const RETENTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Hourly cleanup check

export async function purgeExpiredTelemetry(nowMs = Date.now()): Promise<number> {
  // TimescaleDB drops full chunks through its database retention policy. A
  // row-by-row DELETE would be slower and can contend with telemetry ingest.
  if (process.env.TIMESCALE_ENABLED === "true") return 0;
  const retentionDays = Number(process.env.TELEMETRY_RETENTION_DAYS) || 30;
  if (retentionDays <= 0) return 0;

  const cutoffMs = BigInt(nowMs - retentionDays * 24 * 60 * 60 * 1000);
  try {
    const deleted = await prisma.telemetry.deleteMany({
      where: {
        timestamp: {
          lt: cutoffMs,
        },
      },
    });

    if (deleted.count > 0) {
      console.log(`[Scheduler] 🧹 Purged ${deleted.count} historical telemetry points older than ${retentionDays} days`);
    }
    return deleted.count;
  } catch (err) {
    console.error("[Scheduler] Error purging expired telemetry:", err);
    return 0;
  }
}

export function initScheduler() {
  if (schedulerTimer) return;
  console.log("[Scheduler] ⏰ Automation scheduler background service started (10s interval)");

  schedulerTimer = setInterval(async () => {
    if (isTicking) return;
    isTicking = true;
    try {
      await withDistributedLock("raina:scheduler:tick", 9_000, tickScheduler);
    } catch (err) {
      console.error("[Scheduler Error]:", err);
    } finally {
      isTicking = false;
    }
  }, 10_000);
}

export function closeScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Scheduler] Background service stopped");
  }
}

async function tickScheduler() {
  const now = Date.now();
  const nowBig = BigInt(now);

  // 1. Process Due Delays
  const dueDelays = await prisma.automationDelay.findMany({
    where: { fireAt: { lte: nowBig } },
    include: { automation: true },
    take: 50,
  });

  for (const delay of dueDelays) {
    try {
      if (delay.automation && delay.automation.enabled) {
        let ctx: any = {
          source: "delay_resume",
          projectId: delay.projectId,
          ts: now,
        };
        try {
          ctx = JSON.parse(delay.ctx);
          ctx.source = "delay_resume";
          ctx.ts = now;
        } catch {}

        await executeAutomation(
          delay.automation,
          ctx,
          {
            runId: delay.runId || undefined,
            startNodeId: delay.resumeNodeId,
          }
        );
      }
    } catch (err) {
      console.error(`[Scheduler] Error resuming delay ${delay.id}:`, err);
    } finally {
      await prisma.automationDelay.delete({ where: { id: delay.id } }).catch(() => {});
    }
  }

  // 2. Process Schedule & Solar Triggers
  const scheduledAutomations = await prisma.automation.findMany({
    where: {
      enabled: true,
      triggerType: { in: ["schedule", "sunset_sunrise", "time", "cron"] },
    },
  });

  for (const auto of scheduledAutomations) {
    // Prevent double firing within the same minute
    if (auto.lastRunAt) {
      const elapsed = now - Number(auto.lastRunAt);
      if (elapsed < 55_000) continue;
    }

    let graph: blocks.AutomationGraph | null = null;
    try {
      graph = JSON.parse(auto.graph);
    } catch {
      continue;
    }

    if (!graph || !Array.isArray(graph.nodes)) continue;

    const matchingTrigger = graph.nodes.find((n) => {
      if (n.kind === "schedule") return isScheduleMatching(n.config);
      if (n.kind === "sunset_sunrise") return isSolarMatching(n.config);
      return false;
    });

    if (matchingTrigger) {
      void executeAutomation(auto, {
        source: "schedule",
        projectId: auto.projectId,
        ts: now,
      });
    }
  }

  // 3. Periodic Telemetry Retention Cleanup (Hourly)
  if (now - lastRetentionCleanup >= RETENTION_CLEANUP_INTERVAL_MS) {
    lastRetentionCleanup = now;
    await purgeExpiredTelemetry(now);
  }
}
