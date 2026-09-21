import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: [path.resolve(process.cwd(), ".env"), path.resolve(__dirname, "../../../.env")] });

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initRealtimeBus, closeRealtimeBus } from "./lib/events";
import { prisma } from "@raina/db";

import identityRouter from "./modules/identity";
import projectsRouter from "./modules/projects";
import variablesRouter from "./modules/variables";
import devicesRouter from "./modules/devices";
import dashboardsRouter from "./modules/dashboards";
import telemetryRouter from "./modules/telemetry";
import automationsRouter from "./modules/automations";
import integrationsRouter from "./modules/integrations";
import projectUsersRouter from "./modules/project-users";

// Keep the composed route chain separate from runtime middleware. `typeof api`
// is the contract consumed by the Next.js Hono client; it must not be widened
// by mutable route registration.
const api = new Hono()
  .get("/healthz", (c) => c.json({ ok: true, timestamp: Date.now() }))
  .get("/v1/version", (c) => c.json({ name: "raina", version: "1.0.0", stack: "hono+prisma+rlp" }))
  .route("/v1", identityRouter)
  .route("/v1", projectsRouter)
  .route("/v1", projectUsersRouter)
  .route("/v1", variablesRouter)
  .route("/v1", devicesRouter)
  .route("/v1", dashboardsRouter)
  .route("/v1", telemetryRouter)
  .route("/v1", automationsRouter)
  .route("/v1", integrationsRouter);

export type AppType = typeof api;

const app = new Hono();

app.use("*", logger());
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"];

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return origin;
      }
      return null;
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "x-device-token", "x-session-token"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);


// Global Error & Not Found handlers
app.onError((err, c) => {
  console.error(`[Server Error ${c.req.method} ${c.req.path}]:`, err);
  return c.json(
    {
      error: err.message || "Internal Server Error",
      path: c.req.path,
    },
    500
  );
});

app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      path: c.req.path,
    },
    404
  );
});

import { bindWebSocketApp, injectWebSocket } from "./lib/ws";

app.route("/", api);
bindWebSocketApp(app);

export { app };

import { initScheduler, closeScheduler } from "./services/scheduler.service";

if (process.env.NODE_ENV !== "test") {
  void initRealtimeBus();
  if (process.env.SCHEDULER_ENABLED !== "false") initScheduler();

  const port = Number(process.env.PORT) || 3001;

  console.log(`🚀 raina Hono Server running on port ${port}`);

  const server = serve({
    fetch: app.fetch,
    port,
  });
  injectWebSocket(server);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}, gracefully shutting down...`);
    try {
      if (process.env.SCHEDULER_ENABLED !== "false") closeScheduler();
      await closeRealtimeBus();
      await prisma.$disconnect();
      server.close(() => {
        console.log("[Server] HTTP server closed cleanly");
        process.exit(0);
      });
    } catch (err) {
      console.error("[Server] Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
