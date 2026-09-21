import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@raina/db";
import { eventBus } from "../../lib/events";
import { nanoid } from "nanoid";
import { authenticateSession, requireStaff, verifyProjectAccess, verifyDashboardAccess } from "../../lib/auth";
import { getRequiredParam } from "../../lib/params";
import { dashboardWsHandler } from "./dashboards.ws";
import { loadDashboardSeries } from "./dashboard-series.service";

// ── Validation schemas ─────────────────────────────────────────────────────────
const dashboardCreateSchema = z.object({
  title: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  projectId: z.string().optional(),
  project_id: z.string().optional(),
  visibility: z.string().optional(),
  widgets: z.array(z.record(z.unknown())).optional(),
});

const dashboardUpdateSchema = z.object({
  title: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  layout: z.record(z.unknown()).optional(),
  widgets: z.array(z.record(z.unknown())).optional(),
  visibility: z.string().optional(),
  mobile: z.unknown().optional(),
});

const shareTokenSchema = z.object({
  visibility: z.string().optional(),
  regenerate: z.boolean().optional(),
});

const updateDashboardAccessSchema = z.object({
  users: z.array(z.object({
    userId: z.string(),
    hasAccess: z.boolean(),
    canControl: z.boolean().optional(),
  })),
});

const dashboardQuerySchema = z.object({
  project_id: z.string().optional(),
});

const toDashboardResponse = (d: {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  layout: string;
  visibility: string;
  shareToken: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}) => {
  let parsedLayout: any = { items: [] };
  try {
    parsedLayout = JSON.parse(d.layout);
  } catch {}
  return {
    id: d.id,
    projectId: d.projectId,
    project_id: d.projectId,
    title: d.name,
    name: d.name,
    description: d.description,
    visibility: d.visibility,
    publicToken: d.shareToken,
    share_token: d.shareToken,
    widgets: parsedLayout.items || [],
    layout: parsedLayout,
    created_at: Number(d.createdAt),
    updated_at: Number(d.updatedAt),
  };
};

// List dashboards by query or param
const listDashboards = async (c: Context) => {
  const user = await authenticateSession(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }

  const proj = c.req.query("project_id");
  const where = proj ? { projectId: proj, archivedAt: null } : { archivedAt: null };
  let dashboards = await prisma.dashboard.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  if (user.role === "client") {
    const allowed = await prisma.dashboardAccess.findMany({
      where: { userId: user.id },
      select: { dashboardId: true, projectId: true },
    });
    const allowedDashboardIds = new Set(allowed.map((a) => a.dashboardId));

    const userMemberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
    });
    const allDashboardProjectIds = new Set(
      userMemberships.filter((m) => m.accessAllDashboards).map((m) => m.projectId)
    );

    dashboards = dashboards.filter(
      (d) => allDashboardProjectIds.has(d.projectId) || allowedDashboardIds.has(d.id)
    );
  }

  return c.json(dashboards.map(toDashboardResponse));
};

const getDashboardById = async (c: Context) => {
  const user = await authenticateSession(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }

  const id = getRequiredParam(c, "id");
  const proj = c.req.query("project_id");
  const where: any = { id, archivedAt: null };
  if (proj) {
    where.projectId = proj;
  }
  const dashboard = await prisma.dashboard.findFirst({
    where,
  });

  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  if (user.role === "client") {
    const { allowed } = await verifyDashboardAccess(user.id, user.role, id, "view");
    if (!allowed) return c.json({ error: "Access denied: You do not have permission to view this dashboard" }, 403);
  }

  return c.json(toDashboardResponse(dashboard));
};

const createDashboardDirect = async (c: Context) => {
  const body = await c.req.json() as z.infer<typeof dashboardCreateSchema>;
  const proj = (body.project_id || body.projectId) as string;
  const now = BigInt(Date.now());
  const id = `dsh_${nanoid(10)}`;

  const defaultLayout = {
    grid: { columns: 24 },
    items: body.widgets || [],
  };

  const dashboard = await prisma.dashboard.create({
    data: {
      id,
      projectId: proj,
      name: body.title || body.name || "New Dashboard",
      description: body.description || null,
      layout: JSON.stringify(defaultLayout),
      visibility: body.visibility || "private",
      createdAt: now,
      updatedAt: now,
    },
  });

  return c.json(toDashboardResponse(dashboard));
};

const updateDashboardDirect = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const body = await c.req.json() as z.infer<typeof dashboardUpdateSchema>;
  const now = BigInt(Date.now());

  const existing = await prisma.dashboard.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Dashboard not found" }, 404);

  let shareToken = undefined;
  if (body.visibility === "public") {
    shareToken = existing.shareToken || `share_${nanoid(16)}`;
  } else if (body.visibility === "private") {
    shareToken = null;
  }

  let layoutStr: string | undefined = undefined;
  if (body.layout) {
    layoutStr = JSON.stringify(body.layout);
  } else if (body.widgets) {
    let prevMobile = null;
    try {
      prevMobile = JSON.parse(existing.layout)?.mobile ?? null;
    } catch {}
    layoutStr = JSON.stringify({
      grid: { columns: 24 },
      items: body.widgets,
      mobile: body.mobile !== undefined ? body.mobile : prevMobile,
    });
  }

  const updated = await prisma.dashboard.update({
    where: { id },
    data: {
      ...(body.title || body.name ? { name: body.title || body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(layoutStr ? { layout: layoutStr } : {}),
      ...(body.visibility ? { visibility: body.visibility } : {}),
      ...(shareToken !== undefined ? { shareToken } : {}),
      updatedAt: now,
    },
  });

  return c.json(toDashboardResponse(updated));
};

const deleteDashboardDirect = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const existing = await prisma.dashboard.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Dashboard not found" }, 404);

  await prisma.dashboard.delete({ where: { id } });
  return c.json({ success: true, id });
};

const handleShareTokenPost = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { visibility?: string; regenerate?: boolean };
  const visibility = body.visibility || dashboard.visibility || "public";
  const regenerate = body.regenerate === true;

  let shareToken = dashboard.shareToken;
  if (!shareToken || regenerate) {
    shareToken = `share_${nanoid(16)}`;
  }
  const now = BigInt(Date.now());

  const updated = await prisma.dashboard.update({
    where: { id },
    data: {
      visibility,
      shareToken,
      updatedAt: now,
    },
  });

  return c.json({
    id: updated.id,
    visibility: updated.visibility,
    shareToken: updated.shareToken,
    share_token: updated.shareToken,
    publicToken: updated.shareToken,
  });
};

const handleShareTokenDelete = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  const updated = await prisma.dashboard.update({
    where: { id },
    data: {
      visibility: "private",
      shareToken: null,
      updatedAt: BigInt(Date.now()),
    },
  });

  return c.json({
    id: updated.id,
    visibility: updated.visibility,
    shareToken: null,
    share_token: null,
    publicToken: null,
  });
};

const handleGetAccess = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  const members = await prisma.projectMember.findMany({
    where: { projectId: dashboard.projectId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });

  const accessRecords = await prisma.dashboardAccess.findMany({
    where: { dashboardId: id },
  });

  const accessMap = new Map<string, { canControl: boolean }>();
  for (const ar of accessRecords) {
    accessMap.set(ar.userId, { canControl: ar.canControl });
  }

  const users = members.map((m) => {
    const directAccess = accessMap.get(m.userId);
    const hasAccess = m.accessAllDashboards || !!directAccess;
    return {
      userId: m.user.id,
      name: m.user.name,
      username: m.user.username || m.user.email || "user",
      email: m.user.email,
      role: m.role,
      accessAllDashboards: m.accessAllDashboards,
      hasAccess,
      canControl: directAccess ? directAccess.canControl : true,
    };
  });

  return c.json({
    dashboardId: id,
    projectId: dashboard.projectId,
    visibility: dashboard.visibility,
    shareToken: dashboard.shareToken,
    share_token: dashboard.shareToken,
    users,
  });
};

const handlePutAccess = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  const { users } = await c.req.json<{
    users: Array<{ userId: string; hasAccess: boolean; canControl?: boolean }>;
  }>();

  if (Array.isArray(users)) {
    const now = BigInt(Date.now());
    for (const u of users) {
      if (u.hasAccess) {
        await prisma.dashboardAccess.upsert({
          where: {
            userId_dashboardId: {
              userId: u.userId,
              dashboardId: id,
            },
          },
          create: {
            id: `da_${nanoid(10)}`,
            userId: u.userId,
            projectId: dashboard.projectId,
            dashboardId: id,
            canControl: u.canControl ?? true,
            createdAt: now,
          },
          update: {
            canControl: u.canControl ?? true,
          },
        });
      } else {
        await prisma.dashboardAccess.deleteMany({
          where: {
            userId: u.userId,
            dashboardId: id,
          },
        });
      }
    }
  }

  return c.json({ success: true, dashboardId: id });
};

const handlePublicDashboard = async (c: Context) => {
  const token = getRequiredParam(c, "token");
  const dashboard = await prisma.dashboard.findFirst({
    where: { shareToken: token, archivedAt: null },
  });

  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  if (dashboard.visibility === "disabled") {
    return c.json(
      {
        error: "Dashboard access is temporarily paused by administrator.",
        code: "PAUSED",
        name: dashboard.name,
      },
      403
    );
  }

  if (dashboard.visibility === "users_only" || dashboard.visibility === "private") {
    const user = await authenticateSession(c);
    if (!user) {
      return c.json(
        {
          error: "Sign in required to view this dashboard.",
          code: "LOGIN_REQUIRED",
          name: dashboard.name,
        },
        401
      );
    }

    if (user.role === "client") {
      const { allowed } = await verifyDashboardAccess(user.id, user.role, dashboard.id);
      if (!allowed) {
        return c.json(
          {
            error: "Access denied: Your account has not been assigned permission to view this dashboard.",
            code: "FORBIDDEN",
            name: dashboard.name,
          },
          403
        );
      }
    }
  }

  let parsedLayout: any = { items: [] };
  try {
    parsedLayout = JSON.parse(dashboard.layout);
  } catch {}

  return c.json({
    id: dashboard.id,
    title: dashboard.name,
    name: dashboard.name,
    description: dashboard.description,
    projectId: dashboard.projectId,
    project_id: dashboard.projectId,
    visibility: dashboard.visibility,
    layout: parsedLayout,
    widgets: parsedLayout.items || [],
  });
};

const handleStream = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const dashboard = await prisma.dashboard.findFirst({
    where: {
      OR: [{ id }, { shareToken: id }],
      archivedAt: null,
    },
  });

  if (!dashboard) {
    return c.text("Dashboard not found", 404);
  }

  if (dashboard.visibility === "disabled") {
    return c.text("Forbidden: Dashboard access is paused", 403);
  }

  let sessionUser: { id: string; role: string } | null = null;
  if (dashboard.visibility !== "public") {
    sessionUser = await authenticateSession(c);
    if (!sessionUser) {
      return c.text("Unauthorized: session required", 401);
    }
    const { allowed } = await verifyDashboardAccess(sessionUser.id, sessionUser.role, dashboard.id);
    if (!allowed) {
      return c.text("Forbidden: access to dashboard denied", 403);
    }
  }

  const projectId = dashboard.projectId;
  const encoder = new TextEncoder();

  let parsedLayout: any = { items: [] };
  try {
    parsedLayout = JSON.parse(dashboard.layout);
  } catch {}

  const activeVarKeys: string[] = [];
  for (const item of parsedLayout.items || []) {
    if (item.props?.variable && typeof item.props.variable === "string") {
      activeVarKeys.push(item.props.variable);
    }
    if (Array.isArray(item.props?.variables)) {
      for (const v of item.props.variables) {
        if (typeof v === "string") activeVarKeys.push(v);
      }
    }
    if (Array.isArray(item.props?.series)) {
      for (const s of item.props.series) {
        if (s?.variable && typeof s.variable === "string") {
          activeVarKeys.push(s.variable);
        }
      }
    }
  }
  const targetKeysSet = new Set(activeVarKeys);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      try {
        const variables = await prisma.projectVariable.findMany({
          where: { projectId },
        });

        const targetKeys =
          activeVarKeys.length > 0
            ? [...targetKeysSet]
            : variables.map((v) => v.key);

        const varMap: Record<string, unknown> = {};
        for (const v of variables) {
          if (activeVarKeys.length > 0 && !targetKeysSet.has(v.key)) continue;
          let parsed: unknown = v.value;
          if (v.value !== null && v.value !== undefined) {
            const num = Number(v.value);
            if (!isNaN(num) && isFinite(num)) parsed = num;
          }
          varMap[v.key] = parsed;
        }

        const series = await loadDashboardSeries(projectId, targetKeys);

        const snapshotPayload = JSON.stringify({
          type: "snapshot",
          projectId,
          variables: varMap,
          series,
          timestamp: Date.now(),
        });
        controller.enqueue(encoder.encode(`data: ${snapshotPayload}\n\n`));
      } catch (err) {
        console.error(`[SSE Init Error for ${id}]:`, err);
      }

      let isClosed = false;
      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        eventBus.off(`project:${projectId}`, onProjectEvent);
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      };

      const onProjectEvent = (event: unknown) => {
        try {
          if (activeVarKeys.length > 0) {
            const e = event as { type?: string; variable?: string; key?: string };
            if (e && (e.type === "telemetry" || e.type === "control")) {
              const vKey = e.variable || e.key;
              if (vKey && !targetKeysSet.has(vKey)) {
                return;
              }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {}
      };

      eventBus.on(`project:${projectId}`, onProjectEvent);

      const interval = setInterval(async () => {
        try {
          const currentDash = await prisma.dashboard.findUnique({
            where: { id },
            select: { id: true, visibility: true },
          });
          if (!currentDash || currentDash.visibility === "disabled") {
            cleanup();
            return;
          }
          if (currentDash.visibility !== "public") {
            if (!sessionUser) {
              cleanup();
              return;
            }
            const { allowed } = await verifyDashboardAccess(sessionUser.id, sessionUser.role, id);
            if (!allowed) {
              cleanup();
              return;
            }
          }
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      c.req.raw.signal.addEventListener("abort", () => {
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};

const router = new Hono()
  .get("/dashboards", zValidator("query", dashboardQuerySchema), (c) => listDashboards(c))
  .post("/dashboards", requireStaff, zValidator("json", dashboardCreateSchema), (c) => createDashboardDirect(c))
  .get("/dashboards/:id", zValidator("query", dashboardQuerySchema), (c) => getDashboardById(c))
  .put("/dashboards/:id", requireStaff, zValidator("json", dashboardUpdateSchema), (c) => updateDashboardDirect(c))
  .delete("/dashboards/:id", requireStaff, (c) => deleteDashboardDirect(c))
  .post("/dashboards/:id/share-token", requireStaff, zValidator("json", shareTokenSchema), (c) => handleShareTokenPost(c))
  .delete("/dashboards/:id/share-token", requireStaff, (c) => handleShareTokenDelete(c))
  .get("/dashboards/:id/access", requireStaff, (c) => handleGetAccess(c))
  .put("/dashboards/:id/access", requireStaff, zValidator("json", updateDashboardAccessSchema), (c) => handlePutAccess(c))
  .get("/dashboards/public/:token", (c) => handlePublicDashboard(c))
  .get("/public/dashboards/:token", (c) => handlePublicDashboard(c))
  .get("/dashboards/:id/stream", (c) => handleStream(c))
  .get("/dashboards/:id/ws", dashboardWsHandler)
  // Legacy project path aliases
  .get("/admin/projects/:proj/dashboards", async (c) => {
    const user = await authenticateSession(c);
    if (!user) return c.json({ error: "Unauthorized: Active session required" }, 401);
    const proj = getRequiredParam(c, "proj");
    const hasAccess = await verifyProjectAccess(user.id, user.role, proj, "view");
    if (!hasAccess) return c.json({ error: "Forbidden: You do not have access to this project" }, 403);

    let dashboards = await prisma.dashboard.findMany({
      where: { projectId: proj, archivedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (user.role === "client") {
      const member = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: user.id, projectId: proj } },
      });
      if (!member) return c.json([], 200);
      if (!member.accessAllDashboards) {
        const allowed = await prisma.dashboardAccess.findMany({
          where: { userId: user.id, projectId: proj },
          select: { dashboardId: true },
        });
        const allowedIds = new Set(allowed.map((a) => a.dashboardId));
        dashboards = dashboards.filter((d) => allowedIds.has(d.id));
      }
    }
    return c.json(dashboards.map(toDashboardResponse));
  })
  .post("/admin/projects/:proj/dashboards", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const { name, description } = await c.req.json();
    const now = BigInt(Date.now());
    const id = `dsh_${nanoid(10)}`;
    const defaultLayout = { grid: { columns: 24 }, items: [] };
    const dashboard = await prisma.dashboard.create({
      data: {
        id,
        projectId: proj,
        name: name || "New Dashboard",
        description: description || null,
        layout: JSON.stringify(defaultLayout),
        visibility: "private",
        createdAt: now,
        updatedAt: now,
      },
    });
    return c.json(toDashboardResponse(dashboard));
  })
  .get("/admin/projects/:proj/dashboards/:id", async (c) => {
    const user = await authenticateSession(c);
    if (!user) return c.json({ error: "Unauthorized: Active session required" }, 401);
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const dashboard = await prisma.dashboard.findFirst({
      where: { id, projectId: proj, archivedAt: null },
    });
    if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);
    if (user.role === "client") {
      const { allowed } = await verifyDashboardAccess(user.id, user.role, id, "view");
      if (!allowed) return c.json({ error: "Access denied" }, 403);
    }
    return c.json(toDashboardResponse(dashboard));
  })
  .put("/admin/projects/:proj/dashboards/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const { name, description, layout, visibility } = await c.req.json();
    const now = BigInt(Date.now());
    const existing = await prisma.dashboard.findFirst({ where: { id, projectId: proj } });
    if (!existing) return c.json({ error: "Dashboard not found" }, 404);

    let shareToken = undefined;
    if (visibility === "public") {
      shareToken = existing.shareToken || `share_${nanoid(16)}`;
    } else if (visibility === "private") {
      shareToken = null;
    }

    const updated = await prisma.dashboard.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(layout ? { layout: JSON.stringify(layout) } : {}),
        ...(visibility ? { visibility } : {}),
        ...(shareToken !== undefined ? { shareToken } : {}),
        updatedAt: now,
      },
    });
    return c.json(toDashboardResponse(updated));
  });

export default router;
