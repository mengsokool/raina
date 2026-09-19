import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@raina/db";
import { requireStaff } from "../../lib/auth";
import { getRequiredParam } from "../../lib/params";
import { hashPassword, validatePassword } from "../identity";

// ── Validation schemas ────────────────────────────────────────────────────────
const createProjectUserInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  accessAllDashboards: z.boolean().optional(),
  dashboardIds: z.array(z.string()).optional(),
});

const updateProjectUserInput = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  role: z.string().optional(),
  accessAllDashboards: z.boolean().optional(),
  dashboardIds: z.array(z.string()).optional(),
});

const ROLE_RANKS: Record<string, number> = {
  owner: 4,
  admin: 3,
  staff: 2,
  client: 1,
};

// ── Handlers ──────────────────────────────────────────────────────────────────
const handleListProjectUsers = async (c: Context) => {
  const projectId = getRequiredParam(c, "proj");

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });

  const userIds = members.map((m) => m.userId);
  const dashboardAccessList = await prisma.dashboardAccess.findMany({
    where: {
      projectId,
      userId: { in: userIds },
    },
    include: {
      dashboard: {
        select: { id: true, name: true },
      },
    },
  });

  const result = members.map((m) => {
    const userAccess = dashboardAccessList
      .filter((da) => da.userId === m.userId && da.dashboard)
      .map((da) => ({
        dashboardId: da.dashboard.id,
        dashboardName: da.dashboard.name,
        canControl: da.canControl,
      }));

    return {
      id: m.user.id,
      username: m.user.username || m.user.email || "user",
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      accessAllDashboards: m.accessAllDashboards,
      dashboardAccess: userAccess,
      createdAt: Number(m.addedAt || m.user.createdAt),
    };
  });

  return c.json(result);
};

const handleCreateProjectUser = async (c: Context) => {
  const projectId = getRequiredParam(c, "proj");
  const currentUser = c.get("user") as { id: string; role: string } | undefined;
  const callerRank = ROLE_RANKS[currentUser?.role || ""] ?? 0;
  const {
    username,
    password,
    name,
    email,
    role = "client",
    accessAllDashboards = false,
    dashboardIds = [],
  } = (await c.req.json()) as z.infer<typeof createProjectUserInput>;

  const targetProjectRole = role || "client";
  if ((ROLE_RANKS[targetProjectRole] ?? 0) >= callerRank) {
    return c.json({ error: "Forbidden: Cannot assign a role equal to or higher than your own" }, 403);
  }

  if (!username || !password) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
  const now = BigInt(Date.now());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return c.json({ error: "Project not found" }, 404);

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: cleanUsername },
        ...(cleanEmail ? [{ email: cleanEmail }] : []),
      ],
    },
  });

  if (user) {
    const existingRank = ROLE_RANKS[user.role] ?? 0;
    if (callerRank <= existingRank && currentUser?.id !== user.id) {
      return c.json({ error: "Forbidden: Cannot manage a user with equal or higher platform role" }, 403);
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId,
        },
      },
    });

    if (existingMember) {
      return c.json({ error: "User is already assigned to this project" }, 400);
    }
  } else {
    user = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        name: name || cleanUsername,
        role: "client",
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.account.create({
      data: {
        accountId: cleanUsername,
        providerId: "credential",
        userId: user.id,
        password: hashPassword(password),
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await prisma.projectMember.create({
    data: {
      userId: user.id,
      projectId,
      role: role || "client",
      accessAllDashboards: Boolean(accessAllDashboards),
      addedAt: now,
    },
  });

  if (!accessAllDashboards && Array.isArray(dashboardIds) && dashboardIds.length > 0) {
    for (const dId of dashboardIds) {
      await prisma.dashboardAccess.create({
        data: {
          userId: user.id,
          projectId,
          dashboardId: dId,
          canControl: true,
          createdAt: now,
        },
      });
    }
  }

  const assignedDashboards = await prisma.dashboardAccess.findMany({
    where: { userId: user.id, projectId },
    include: { dashboard: { select: { id: true, name: true } } },
  });

  return c.json({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: role || "client",
    accessAllDashboards: Boolean(accessAllDashboards),
    dashboardAccess: assignedDashboards.map((da) => ({
      dashboardId: da.dashboard.id,
      dashboardName: da.dashboard.name,
      canControl: da.canControl,
    })),
    createdAt: Number(now),
  });
};

const handleUpdateProjectUser = async (c: Context) => {
  const projectId = getRequiredParam(c, "proj");
  const userId = getRequiredParam(c, "userId");
  const currentUser = c.get("user") as { id: string; role: string } | undefined;
  const callerRank = ROLE_RANKS[currentUser?.role || ""] ?? 0;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return c.json({ error: "User not found" }, 404);

  const targetRank = ROLE_RANKS[targetUser.role] ?? 0;
  if (currentUser?.id !== userId && callerRank <= targetRank) {
    return c.json({ error: "Forbidden: Cannot modify a user with equal or higher role" }, 403);
  }

  const {
    name,
    email,
    password,
    role,
    accessAllDashboards,
    dashboardIds,
  } = (await c.req.json()) as z.infer<typeof updateProjectUserInput>;

  if (role !== undefined && (ROLE_RANKS[role] ?? 0) >= callerRank) {
    return c.json({ error: "Forbidden: Cannot assign a role equal to or higher than your own" }, 403);
  }

  const now = BigInt(Date.now());

  const member = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!member) return c.json({ error: "User is not a member of this project" }, 404);

  const userUpdateData: any = { updatedAt: now };
  if (name !== undefined) userUpdateData.name = name;
  if (email !== undefined) userUpdateData.email = email ? email.trim().toLowerCase() : null;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: userUpdateData,
  });

  if (password && password.trim()) {
    const passwordError = validatePassword(password);
    if (passwordError) {
      return c.json({ error: passwordError }, 400);
    }

    const account = await prisma.account.findFirst({
      where: { userId, providerId: "credential" },
    });
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: hashPassword(password), updatedAt: now },
      });
    } else {
      await prisma.account.create({
        data: {
          accountId: updatedUser.username || userId,
          providerId: "credential",
          userId,
          password: hashPassword(password),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  const memberUpdateData: any = {};
  if (role !== undefined) memberUpdateData.role = role;
  if (accessAllDashboards !== undefined) memberUpdateData.accessAllDashboards = Boolean(accessAllDashboards);

  if (Object.keys(memberUpdateData).length > 0) {
    await prisma.projectMember.update({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
      data: memberUpdateData,
    });
  }

  if (accessAllDashboards !== undefined || dashboardIds !== undefined) {
    await prisma.dashboardAccess.deleteMany({
      where: {
        userId,
        projectId,
      },
    });

    const isAll = accessAllDashboards !== undefined ? Boolean(accessAllDashboards) : member.accessAllDashboards;
    if (!isAll && Array.isArray(dashboardIds) && dashboardIds.length > 0) {
      for (const dId of dashboardIds) {
        await prisma.dashboardAccess.create({
          data: {
            userId,
            projectId,
            dashboardId: dId,
            canControl: true,
            createdAt: now,
          },
        });
      }
    }
  }

  const assignedDashboards = await prisma.dashboardAccess.findMany({
    where: { userId, projectId },
    include: { dashboard: { select: { id: true, name: true } } },
  });

  return c.json({
    id: updatedUser.id,
    username: updatedUser.username,
    email: updatedUser.email,
    name: updatedUser.name,
    role: role || member.role,
    accessAllDashboards: accessAllDashboards !== undefined ? Boolean(accessAllDashboards) : member.accessAllDashboards,
    dashboardAccess: assignedDashboards.map((da) => ({
      dashboardId: da.dashboard.id,
      dashboardName: da.dashboard.name,
      canControl: da.canControl,
    })),
    createdAt: Number(member.addedAt),
  });
};

const handleDeleteProjectUser = async (c: Context) => {
  const projectId = getRequiredParam(c, "proj");
  const userId = getRequiredParam(c, "userId");
  const currentUser = c.get("user") as { id: string; role: string } | undefined;
  const callerRank = ROLE_RANKS[currentUser?.role || ""] ?? 0;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return c.json({ error: "User not found" }, 404);

  const targetRank = ROLE_RANKS[targetUser.role] ?? 0;
  if (currentUser?.id !== userId && callerRank <= targetRank) {
    return c.json({ error: "Forbidden: Cannot delete a user with equal or higher role" }, 403);
  }

  await prisma.dashboardAccess.deleteMany({
    where: {
      userId,
      projectId,
    },
  });

  await prisma.projectMember.deleteMany({
    where: {
      userId,
      projectId,
    },
  });

  await prisma.session.deleteMany({
    where: { userId },
  });

  const otherMemberships = await prisma.projectMember.count({
    where: { userId },
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (otherMemberships === 0 && user?.role === "client") {
    await prisma.user.delete({ where: { id: userId } });
  }

  return c.json({ success: true, userId });
};

// ── Typed Route Chain ─────────────────────────────────────────────────────────
const router = new Hono()
  .get("/admin/projects/:proj/users", requireStaff, (c) => handleListProjectUsers(c))
  .post("/admin/projects/:proj/users", requireStaff, zValidator("json", createProjectUserInput), (c) => handleCreateProjectUser(c))
  .put("/admin/projects/:proj/users/:userId", requireStaff, zValidator("json", updateProjectUserInput), (c) => handleUpdateProjectUser(c))
  .delete("/admin/projects/:proj/users/:userId", requireStaff, (c) => handleDeleteProjectUser(c));

export default router;
