import { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createRouter } from "../../env";
import { authenticateSession, requireStaff, verifyProjectAccess } from "../../lib/auth";
import { eventBus } from "../../lib/events";
import { getRequiredParam } from "../../lib/params";
import { createVariableInputSchema, patchVariableInputSchema } from "./variables.schema";
import { variableService } from "./variables.service";

const checkProjectReadAccess = async (c: Context, next: any) => {
  const user = await authenticateSession(c);
  if (!user) return c.json({ error: "Unauthorized: Active session required" }, 401);
  const proj = getRequiredParam(c, "proj");
  const hasAccess = await verifyProjectAccess(user.id, user.role, proj, "view");
  if (!hasAccess) return c.json({ error: "Forbidden: You do not have access to this project" }, 403);
  c.set("user", user);
  c.set("userId", user.id);
  await next();
};

const handleStream = async (c: Context) => {
  const proj = getRequiredParam(c, "proj");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      const onEvent = (event: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {}
      };
      eventBus.on(`project:${proj}`, onEvent);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);
      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        eventBus.off(`project:${proj}`, onEvent);
        try {
          controller.close();
        } catch {}
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};

export const variablesRouter = createRouter()
  // List variables (admin canonical path)
  .get("/admin/projects/:proj/variables", checkProjectReadAccess, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const variables = await variableService.listVariables(proj);
    return c.json(variables);
  })
  // Create variable
  .post("/projects/:proj/variables", requireStaff, zValidator("json", createVariableInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const input = c.req.valid("json");
    const result = await variableService.createVariable(proj, input);
    return c.json(result);
  })
  // Delete variable
  .delete("/admin/projects/:proj/variables/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const result = await variableService.deleteVariable(proj, id);
    if (!result) return c.json({ error: "not_found" }, 404);
    return c.json({ success: true, id: result.id, key: result.key });
  })
  // Project state snapshot
  .get("/projects/:proj/state", checkProjectReadAccess, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const state = await variableService.getProjectState(proj);
    return c.json(state);
  })
  // Historical series
  .get("/projects/:proj/variables/:key/series", checkProjectReadAccess, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const key = getRequiredParam(c, "key");
    const series = await variableService.getVariableSeries(proj, key);
    return c.json(series);
  })
  // SSE streams
  .get("/projects/:proj/variables/stream", checkProjectReadAccess, handleStream)
  .get("/projects/:proj/stream", checkProjectReadAccess, handleStream)
  // Alias list path
  .get("/projects/:proj/variables", checkProjectReadAccess, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const variables = await variableService.listVariables(proj);
    return c.json(variables);
  })
  // Patch variable (admin path)
  .patch("/admin/projects/:proj/variables/:id", requireStaff, zValidator("json", patchVariableInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const input = c.req.valid("json");
    const updated = await variableService.patchVariable(proj, id, input);
    if (!updated) return c.json({ error: "Variable not found" }, 404);
    return c.json(updated);
  })
  // Delete via alias path
  .delete("/projects/:proj/variables/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const result = await variableService.deleteVariable(proj, id);
    if (!result) return c.json({ error: "not_found" }, 404);
    return c.json({ success: true, id: result.id, key: result.key });
  });

export default variablesRouter;
