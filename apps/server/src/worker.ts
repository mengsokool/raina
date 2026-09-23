import "./load-env";

import { prisma } from "@raina/db";
import { closeRealtimeBus, initRealtimeBus } from "./lib/events";
import { closeAutomationWorker, initAutomationWorker } from "./lib/automation-queue";
import { closeScheduler, initScheduler } from "./services/scheduler.service";

async function shutdown(signal: string) {
  console.log(`\\n[Worker] Received ${signal}, shutting down...`);
  closeScheduler();
  closeAutomationWorker();
  await closeRealtimeBus();
  await prisma.$disconnect();
  process.exit(0);
}

async function startWorker() {
  await initRealtimeBus();
  initScheduler();
  initAutomationWorker();
  console.log("[Worker] Background scheduler and automation consumer started");
}

void startWorker();

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
