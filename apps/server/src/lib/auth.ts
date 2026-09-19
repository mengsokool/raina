import { Context, Next } from "hono";
import { prisma } from "@raina/db";

export interface AuthUser {
  id: string;
  email?: string | null;
  username: string;
  role: string;
  name: string | null;
}

export type ResourcePermission = "view" | "control" | "edit" | "admin";

declare module "hono" {
  interface ContextVariableMap {
    user?: AuthUser;
    userId?: string;
  }
}

/**
 * Extracts and verifies the user session without fallbacks.
 */
export async function authenticateSession(c: Context): Promise<AuthUser | null> {
  const authHeader = c.req.header("Authorization");
  const sessionHeader = c.req.header("x-session-token");
  const cookieHeader = c.req.header("Cookie") || "";

  let token =
    sessionHeader ||
    authHeader?.replace(/^Bearer\s+/i, "") ||
    c.req.query("token") ||
    c.req.query("session");

  if (!token && cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)raina_session=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return null;
  }

  const now = BigInt(Date.now());

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (session && session.expiresAt > now) {
    return {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username || session.user.email || "user",
      role: session.user.role,
      name: session.user.name,
    };
  }

  return null;
}

/**
 * Middleware ensuring an authenticated user is present.
 */
export async function requireAuth(c: Context, next: Next) {
  const user = await authenticateSession(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }
  c.set("user", user);
  c.set("userId", user.id);
  await next();
}

/**
 * Generic RBAC middleware.
 */
export function requireRoles(allowedRoles: string[]) {
  return async (c: Context, next: Next) => {
    const user = await authenticateSession(c);
    if (!user) {
      return c.json({ error: "Unauthorized: Active session required" }, 401);
    }
    if (!allowedRoles.includes(user.role)) {
      return c.json(
        { error: `Forbidden: Requires one of [${allowedRoles.join(", ")}] roles` },
        403
      );
    }
    c.set("user", user);
    c.set("userId", user.id);
    await next();
  };
}

/**
 * Middleware ensuring user has back-office staff/admin/owner role.
 */
export const requireStaff = requireRoles(["owner", "admin", "staff"]);

/**
 * Middleware ensuring user has system admin or owner role.
 */
export const requireAdmin = requireRoles(["owner", "admin"]);

/**
 * Middleware ensuring user is the primary system owner.
 */
export const requireOwner = requireRoles(["owner"]);

/**
 * Verifies that the authenticated user has access to the specified project.
 */
export async function verifyProjectAccess(
  userId: string,
  userRole: string,
  projectId: string,
  requiredPermission: ResourcePermission = "view"
): Promise<boolean> {
  // Owner, admin, and staff have full access to all projects
  if (userRole === "owner" || userRole === "admin" || userRole === "staff") {
    return true;
  }

  // Check project membership
  const member = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!member) return false;

  if (requiredPermission === "edit" || requiredPermission === "admin") {
    return member.role === "admin" || member.role === "owner" || member.role === "editor";
  }

  return true;
}

/**
 * Verifies that the user has access to a specific dashboard with the required permission.
 */
export async function verifyDashboardAccess(
  userId: string,
  userRole: string,
  dashboardId: string,
  requiredPermission: "view" | "control" | "edit" = "view"
): Promise<{ allowed: boolean; canControl: boolean }> {
  if (userRole === "owner" || userRole === "admin" || userRole === "staff") {
    return { allowed: true, canControl: true };
  }

  // Clients cannot edit dashboard layouts
  if (requiredPermission === "edit") {
    return { allowed: false, canControl: false };
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
    select: { projectId: true },
  });

  if (!dashboard) return { allowed: false, canControl: false };

  // Check project membership
  const member = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId: dashboard.projectId,
      },
    },
  });

  if (!member) return { allowed: false, canControl: false };

  // If member has access to all dashboards in the project
  if (member.accessAllDashboards) {
    return { allowed: true, canControl: true };
  }

  // Check specific dashboard access
  const access = await prisma.dashboardAccess.findUnique({
    where: {
      userId_dashboardId: {
        userId,
        dashboardId,
      },
    },
  });

  if (!access) return { allowed: false, canControl: false };

  if (requiredPermission === "control" && !access.canControl) {
    return { allowed: true, canControl: false };
  }

  return { allowed: true, canControl: Boolean(access.canControl) };
}

/**
 * Verifies that the user has hardware control permission for the project.
 */
export async function verifyControlPermission(
  userId: string,
  userRole: string,
  projectId: string
): Promise<boolean> {
  if (userRole === "owner" || userRole === "admin" || userRole === "staff") {
    return true;
  }

  // Check project membership
  const member = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!member) return false;

  // If member has access to all dashboards
  if (member.accessAllDashboards) {
    return true;
  }

  // Check if user has canControl permission on at least one dashboard in this project
  const accessWithControl = await prisma.dashboardAccess.findFirst({
    where: {
      userId,
      projectId,
      canControl: true,
    },
  });

  return Boolean(accessWithControl);
}

