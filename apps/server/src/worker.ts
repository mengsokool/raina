import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: [path.resolve(process.cwd(), ".env"), path.resolve(__dirname, "../../../.env")] });

import { prisma } from "@raina/db";
import { closeEmqx, initEmqx } from "./lib/emqx";
import { closeRealtimeBus, initRealtimeBus } from "./lib/events";
import { closeScheduler, initScheduler } from "./services/scheduler.service";

async function shutdown(signal: string) {
  console.log(`\\n[Worker] Received ${signal}, shutting down...`);
  closeScheduler();
  await closeRealtimeBus();
  await closeEmqx();
  await prisma.$disconnect();
  process.exit(0);
}

initEmqx();
void initRealtimeBus();
initScheduler();
console.log("[Worker] Background scheduler started");

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
