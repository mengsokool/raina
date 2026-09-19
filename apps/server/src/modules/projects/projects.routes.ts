import { zValidator } from "@hono/zod-validator";
import { createRouter } from "../../env";
import { requireAuth, requireStaff, verifyProjectAccess } from "../../lib/auth";
import { getRequiredParam } from "../../lib/params";
import { projectInputSchema, projectUpdateInputSchema } from "./projects.schema";
import { projectService } from "./projects.service";

export const projectsRouter = createRouter()
  .get("/admin/projects", requireAuth, async (c) => {
    const projects = await projectService.listProjects(c.var.user);
    return c.json(projects);
  })
  .post("/admin/projects", requireStaff, zValidator("json", projectInputSchema), async (c) => {
    const input = c.req.valid("json");
    const project = await projectService.createProject(input);
    return c.json(project);
  })
  .get("/admin/projects/:proj", requireAuth, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const user = c.var.user;
    if (!(await verifyProjectAccess(user.id, user.role, proj, "view"))) {
      return c.json({ error: "Forbidden: You do not have access to this project" }, 403);
    }
    const project = await projectService.getProjectById(proj);
    if (!project) return c.json({ error: "Project not found" }, 404);
    return c.json(project);
  })
  .put("/admin/projects/:proj", requireStaff, zValidator("json", projectUpdateInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const input = c.req.valid("json");
    const updated = await projectService.updateProject(proj, input);
    return c.json(updated);
  })
  .delete("/admin/projects/:proj", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    await projectService.archiveProject(proj);
    return c.json({ success: true, id: proj });
  });

export default projectsRouter;
