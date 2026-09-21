import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@raina/db";
import crypto from "crypto";
import { authenticateSession, requireAuth, requireStaff, requireAdmin } from "../../lib/auth";
import { issueWsTicket } from "../../lib/ws-ticket";
import { getRealtimeBusStatus } from "../../lib/events";
import { getAutomationQueueStatus } from "../../lib/automation-queue";
import { getRequiredParam } from "../../lib/params";
import { getRedisClient } from "../../lib/redis";
import { config } from "../../config";

// ── Validation schemas ────────────────────────────────────────────────────────
const signInSchema = z.object({
  identifier: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1),
});

const bootstrapSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().optional(),
  name: z.string().optional(),
  password: z.string().min(1),
  setupToken: z.string().optional(),
});

const profileSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

const createStaffSchema = z.object({
  username: z.string().min(1),
  name: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(1),
  role: z.enum(["admin", "staff"]).optional().default("staff"),
});

const updateStaffSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  password: z.string().optional(),
});


export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")): string {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") {
    return "Password is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  return null;
}

export function getSessionCookieHeader(token: string, maxAge = 30 * 24 * 60 * 60): string {
  const isSecure = config.publicApiUrl
    ? config.publicApiUrl.startsWith("https://")
    : config.isProduction;
  const domain = config.cookieDomain;
  return `raina_session=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${isSecure ? "; Secure" : ""}`;
}

export function getClearSessionCookieHeader(): string {
  const isSecure = config.publicApiUrl
    ? config.publicApiUrl.startsWith("https://")
    : config.isProduction;
  const domain = config.cookieDomain;
  return `raina_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${isSecure ? "; Secure" : ""}`;
}

// Distributed (Redis) with in-memory fallback sliding window rate limiter for login
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, RateLimitEntry>();

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) {
    return false;
  }
  entry.count++;
  return true;
}

export async function checkLoginRateLimitAsync(ip: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const key = `raina:ratelimit:login:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 60);
      }
      return count <= 10;
    } catch {
      // Fallback to in-memory on Redis error
    }
  }
  return checkLoginRateLimit(ip);
}

export function resetLoginRateLimit(ip: string): void {
  loginAttempts.delete(ip);
  const redis = getRedisClient();
  if (redis) {
    void redis.del(`raina:ratelimit:login:${ip}`).catch(() => {});
  }
}

export function extractClientIp(c: Context): string {
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return "127.0.0.1";
}

// Dummy constant-time verification parameters to mitigate user enumeration timing attacks
const DUMMY_SALT = "0123456789abcdef0123456789abcdef";
const DUMMY_HASH = crypto.scryptSync("dummy_password_constant_time", DUMMY_SALT, 64).toString("hex");

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) {
    // Perform dummy calculation to equalize timing
    const dummyCalc = crypto.scryptSync(password, DUMMY_SALT, 64).toString("hex");
    crypto.timingSafeEqual(Buffer.from(dummyCalc), Buffer.from(DUMMY_HASH));
    return false;
  }
  try {
    if (stored.includes(":")) {
      const [salt, hash] = stored.split(":");
      const calc = crypto.scryptSync(password, salt, 64).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
    }
    // Legacy unsalted sha256 fallback
    const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(stored));
  } catch {
    return false;
  }
}

// Check if system needs bootstrap (first owner)
const handleBootstrapStatus = async (c: Context) => {
  const count = await prisma.user.count();
  return c.json({ bootstrap: count === 0, requiresSetupToken: config.isProduction });
};

// Bootstrap first owner
const handleBootstrap = async (c: Context) => {
  const { email, username, name, password, setupToken } = await c.req.json();
  if (config.isProduction) {
    const expectedToken = config.setupToken;
    if (!expectedToken || !setupToken ||
      !crypto.timingSafeEqual(
        crypto.createHash("sha256").update(setupToken).digest(),
        crypto.createHash("sha256").update(expectedToken).digest()
      )) {
      return c.json({ error: "Invalid setup token" }, 403);
    }
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  const now = BigInt(Date.now());
  const finalUsername = username || (email ? email.split("@")[0] : "admin");

  const result = await prisma.$transaction(async (tx) => {
    // Serialize first-owner creation so two concurrent requests cannot create two owners.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73461825)::text AS locked`;
    if (await tx.user.count() > 0) return null;

    const user = await tx.user.create({
      data: {
        email: email || null,
        username: finalUsername,
        name: name || "System Owner",
        role: "owner",
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.account.create({
      data: {
        accountId: finalUsername,
        providerId: "credential",
        userId: user.id,
        password: hashPassword(password),
        createdAt: now,
        updatedAt: now,
      },
    });

    const token = crypto.randomBytes(32).toString("hex");
    await tx.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: now + BigInt(30 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      },
    });
    return { user, token };
  });

  if (!result) return c.json({ error: "System already bootstrapped" }, 400);

  c.header("Set-Cookie", getSessionCookieHeader(result.token));

  return c.json(result);
};

// Sign-in handler (supporting both Username and Email)
const handleSignIn = async (c: Context) => {
  // Extract client IP for rate limiting
  const ip = extractClientIp(c);

  if (!(await checkLoginRateLimitAsync(ip))) {
    return c.json({ error: "Too many login attempts. Please try again in 1 minute." }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const loginKey = (body.identifier || body.username || body.email || "").trim();
  const password = body.password || "";

  if (!loginKey || !password) {
    return c.json({ error: "Username/Email and Password are required" }, 400);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: loginKey, mode: "insensitive" } },
        { email: { equals: loginKey, mode: "insensitive" } },
      ],
    },
  });

  if (!user) {
    // Constant-time execution to prevent username enumeration
    verifyPassword(password, null);
    return c.json({ error: "Invalid username/email or password" }, 401);
  }

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (!account || !verifyPassword(password, account.password)) {
    return c.json({ error: "Invalid username/email or password" }, 401);
  }

  // Reset rate limit upon successful authentication
  resetLoginRateLimit(ip);

  const now = BigInt(Date.now());
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt: now + BigInt(30 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now },
  });

  c.header("Set-Cookie", getSessionCookieHeader(token));

  return c.json({
    user: {
      id: user.id,
      username: user.username || user.email || "user",
      email: user.email,
      name: user.name,
      role: user.role,
    },
    token,
  });
};

// Sign-out
const handleSignOut = async (c: Context) => {
  const authHeader = c.req.header("Authorization");
  const sessionHeader = c.req.header("x-session-token");
  const cookieHeader = c.req.header("Cookie");
  const cookieMatch = cookieHeader?.match(/(?:^|;\s*)(?:__Host-)?raina_session=([^;]+)/);
  const token = sessionHeader || cookieMatch?.[1] || authHeader?.replace(/^Bearer\s+/i, "");

  if (token) {
    try {
      await prisma.session.deleteMany({ where: { token } });
    } catch (err) {
      console.error("Failed to delete session record on sign-out", err);
    }
  }

  // Explicitly clear session cookie with secure flags across all HTTP responses
  c.header("Set-Cookie", getClearSessionCookieHeader());
  return c.json({ success: true });
};

const handleWsTicket = async (c: Context) => {
  const token = c.req.header("x-session-token") || c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") || c.req.header("Cookie")?.match(/(?:^|;\s*)(?:__Host-)?raina_session=([^;]+)/)?.[1];
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ ticket: issueWsTicket(token), expiresIn: 60 });
};


// Get session info / me (for current authenticated user)
const handleMe = async (c: Context) => {
  const authUser = await authenticateSession(c);
  if (!authUser) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: {
      memberships: {
        include: {
          project: {
            select: { id: true, name: true, description: true },
          },
        },
      },
      dashboardAccess: {
        include: {
          dashboard: {
            select: { id: true, name: true, projectId: true },
          },
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const isBackOffice = user.role === "owner" || user.role === "admin" || user.role === "staff";

  let projects: { id: string; name: string }[] = [];
  let accessibleDashboards: { id: string; name: string; projectId: string; canControl: boolean }[] = [];

  if (isBackOffice) {
    // Back-office staff see all non-archived projects
    projects = await prisma.project.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
    });
  } else {
    // Client sees only assigned projects
    projects = user.memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
    }));

    // Compute accessible dashboards
    for (const membership of user.memberships) {
      if (membership.accessAllDashboards) {
        const pDashboards = await prisma.dashboard.findMany({
          where: { projectId: membership.projectId, archivedAt: null },
          select: { id: true, name: true, projectId: true },
        });
        for (const d of pDashboards) {
          accessibleDashboards.push({
            id: d.id,
            name: d.name,
            projectId: d.projectId,
            canControl: true,
          });
        }
      } else {
        // Specific dashboard access
        const pAccess = user.dashboardAccess.filter((da) => da.projectId === membership.projectId);
        for (const da of pAccess) {
          if (da.dashboard) {
            accessibleDashboards.push({
              id: da.dashboard.id,
              name: da.dashboard.name,
              projectId: da.dashboard.projectId,
              canControl: da.canControl,
            });
          }
        }
      }
    }
  }

  return c.json({
    id: user.id,
    email: user.email,
    username: user.username || user.email || "user",
    name: user.name,
    role: user.role,
    projects,
    accessibleDashboards,
  });
};

// Update current user profile and password
const handleProfileUpdate = async (c: Context) => {
  const authUser = await authenticateSession(c);
  if (!authUser) {
    return c.json({ error: "Unauthorized: Active session required" }, 401);
  }

  const { name, email, currentPassword, newPassword } = (await c.req.json()) as z.infer<typeof profileSchema>;
  const now = BigInt(Date.now());

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) return c.json({ error: "User not found" }, 404);

  // If email change is requested, ensure uniqueness
  if (email !== undefined && email !== null && email.trim() !== "") {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== user.email) {
      const existing = await prisma.user.findFirst({
        where: {
          email: { equals: cleanEmail, mode: "insensitive" },
          id: { not: user.id },
        },
      });
      if (existing) {
        return c.json({ error: "Email address is already in use by another account" }, 400);
      }
    }
  }

  // If password change is requested, verify current password first
  if (newPassword) {
    if (!currentPassword) {
      return c.json({ error: "Current password is required to set a new password" }, 400);
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return c.json({ error: passwordError }, 400);
    }

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });

    if (!account || !verifyPassword(currentPassword, account.password)) {
      return c.json({ error: "Incorrect current password" }, 400);
    }

    await prisma.account.update({
      where: { id: account.id },
      data: {
        password: hashPassword(newPassword),
        updatedAt: now,
      },
    });

    // Invalidate other active sessions for this user upon password change
    const authHeader = c.req.header("Authorization");
    const sessionHeader = c.req.header("x-session-token");
    const cookieHeader = c.req.header("Cookie");
    const cookieMatch = cookieHeader?.match(/(?:^|;\s*)(?:__Host-)?raina_session=([^;]+)/);
    const currentToken = sessionHeader || cookieMatch?.[1] || authHeader?.replace(/^Bearer\s+/i, "");

    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        ...(currentToken ? { token: { not: currentToken } } : {}),
      },
    });
  }

  // Update user details

  const updateData: any = { updatedAt: now };
  if (name !== undefined) updateData.name = name.trim();
  if (email !== undefined) updateData.email = email && email.trim() ? email.trim().toLowerCase() : null;

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  return c.json({
    id: updatedUser.id,
    username: updatedUser.username,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
  });
};

function getPublicEndpoints(c: Context) {
  const forwardedProto = c.req.header("x-forwarded-proto");
  const forwardedHost = c.req.header("x-forwarded-host");
  const host = c.req.header("host");
  const defaultHost = host ? `${forwardedProto || "http"}://${forwardedHost || host}` : "http://127.0.0.1:3001";
  const publicApiUrl = config.publicApiUrl || defaultHost;
  const publicRlpHost = config.publicRlpHost;
  const publicRlpPort = config.publicRlpPort;
  const rlpTls = config.publicRlpTls;

  return {
    rlp: `${rlpTls ? "rlps" : "rlp"}://${publicRlpHost}:${publicRlpPort}`,
    http: `${publicApiUrl.replace(/\/+$/, "")}/v1/telemetry`,
  };
}

// Live platform diagnostics (Staff/Admin/Owner)
const handleDiagnostics = async (c: Context) => {
  const t0 = Date.now();
  let dbStatus = "healthy";
  let dbLatencyMs = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbStatus = "unhealthy";
  }

  const redisStatus = getRealtimeBusStatus();
  const automationQueue = await getAutomationQueueStatus();
  const endpoints = getPublicEndpoints(c);

  const [
    projectCount,
    dashboardCount,
    deviceCount,
    tokenCount,
    variableCount,
    telemetryCount,
    userCount,
  ] = await Promise.all([
    prisma.project.count({ where: { archivedAt: null } }),
    prisma.dashboard.count({ where: { archivedAt: null } }),
    prisma.device.count(),
    prisma.projectToken.count(),
    prisma.projectVariable.count(),
    prisma.telemetry.count(),
    prisma.user.count(),
  ]);

  const mem = process.memoryUsage();

  return c.json({
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      engine: "PostgreSQL 17",
      orm: "Prisma Client 6.x",
    },
    rlp: {
      status: "managed-by-gateway",
      transport: "RLP v1 over TCP/TLS",
      requiresRedis: config.rlpRequireRedis,
    },
    redis: redisStatus,
    automationQueue,
    endpoints,
    stats: {
      projects: projectCount,
      dashboards: dashboardCount,
      devices: deviceCount,
      tokens: tokenCount,
      variables: variableCount,
      telemetry: telemetryCount,
      users: userCount,
    },
    system: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      },
      timestamp: Date.now(),
    },
  });
};

// ─── Staff Management (Root Back-office) ──────────────────────────────────────

// List all staff & admin users (Staff/Admin/Owner)
const handleListStaff = async (c: Context) => {
  const staffUsers = await prisma.user.findMany({
    where: {
      role: { in: ["owner", "admin", "staff"] },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json(
    staffUsers.map((u) => ({
      id: u.id,
      username: u.username || u.email?.split("@")[0] || "staff",
      email: u.email,
      name: u.name,
      role: u.role,
      lastLoginAt: u.lastLoginAt ? Number(u.lastLoginAt) : null,
      createdAt: Number(u.createdAt),
    }))
  );
};

// Create new staff (Admin/Owner only)
const handleCreateStaff = async (c: Context) => {
  const { username, name, email, password, role = "staff" } = (await c.req.json()) as z.infer<typeof createStaffSchema>;

  if (!username || !password) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  const cleanUsername = username.trim().toLowerCase();

  // Check unique username
  const existingUsername = await prisma.user.findUnique({
    where: { username: cleanUsername },
  });
  if (existingUsername) {
    return c.json({ error: "Username is already in use" }, 400);
  }

  if (email && email.trim()) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existingEmail) {
      return c.json({ error: "Email is already in use" }, 400);
    }
  }

  const now = BigInt(Date.now());
  const allowedRoles = ["admin", "staff"];
  const finalRole = allowedRoles.includes(role) ? role : "staff";

  const user = await prisma.user.create({
    data: {
      username: cleanUsername,
      email: email ? email.trim().toLowerCase() : null,
      name: name || cleanUsername,
      role: finalRole,
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

  return c.json({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: Number(user.createdAt),
  });
};

// Update staff (Admin/Owner only)
const handleUpdateStaff = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const { name, email, role, password } = (await c.req.json()) as z.infer<typeof updateStaffSchema>;
  const now = BigInt(Date.now());

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ error: "Staff user not found" }, 404);

  if (password) {
    const passwordError = validatePassword(password);
    if (passwordError) {
      return c.json({ error: passwordError }, 400);
    }
  }

  // Prevent changing role of the primary owner if it's the only one
  if (user.role === "owner" && role && role !== "owner") {
    const ownerCount = await prisma.user.count({ where: { role: "owner" } });
    if (ownerCount <= 1) {
      return c.json({ error: "Cannot downgrade the only system owner" }, 400);
    }
  }

  const updateData: any = { updatedAt: now };
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email ? email.trim().toLowerCase() : null;
  if (role && ["owner", "admin", "staff"].includes(role)) updateData.role = role;

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
  });

  if (password) {
    const account = await prisma.account.findFirst({
      where: { userId: id, providerId: "credential" },
    });
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: hashPassword(password), updatedAt: now },
      });
    } else {
      await prisma.account.create({
        data: {
          accountId: updatedUser.username || updatedUser.email || id,
          providerId: "credential",
          userId: id,
          password: hashPassword(password),
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  // Revoke active sessions if credentials or role were modified
  if (password || (role && role !== user.role)) {
    await prisma.session.deleteMany({
      where: { userId: id },
    });
  }

  return c.json({
    id: updatedUser.id,
    username: updatedUser.username,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
  });
};

// Delete staff (Admin/Owner only)
const handleDeleteStaff = async (c: Context) => {
  const id = getRequiredParam(c, "id");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ error: "Staff user not found" }, 404);

  if (user.role === "owner") {
    const ownerCount = await prisma.user.count({ where: { role: "owner" } });
    if (ownerCount <= 1) {
      return c.json({ error: "Cannot delete the only system owner" }, 400);
    }
  }

  await prisma.user.delete({ where: { id } });
  return c.json({ success: true, id });
};

// Legacy /admin/users endpoint for backward compatibility
const handleLegacyUsers = async (c: Context) => {
  const users = await prisma.user.findMany({
    include: { memberships: { include: { project: true } } },
    orderBy: { createdAt: "desc" },
  });

  return c.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      role: u.role,
      created_at: Number(u.createdAt),
      projects: u.memberships.map((m) => ({ id: m.project.id, name: m.project.name })),
    }))
  );
};

// Expose all identity endpoints as a typed chain.
const router = new Hono()
  .get("/public/endpoints", (c) => c.json(getPublicEndpoints(c)))
  .get("/public/bootstrap-status", (c) => handleBootstrapStatus(c))
  .post("/auth/bootstrap", zValidator("json", bootstrapSchema), (c) => handleBootstrap(c))
  .post("/auth/sign-in", zValidator("json", signInSchema), (c) => handleSignIn(c))
  .post("/auth/sign-in/email", zValidator("json", signInSchema), (c) => handleSignIn(c))
  .post("/auth/sign-out", (c) => handleSignOut(c))
  .post("/auth/ws-ticket", requireAuth, (c) => handleWsTicket(c))
  .get("/auth/me", (c) => handleMe(c))
  .get("/admin/me", (c) => handleMe(c))
  .patch("/auth/profile", zValidator("json", profileSchema), (c) => handleProfileUpdate(c))
  .get("/admin/diagnostics", requireStaff, (c) => handleDiagnostics(c))
  .get("/admin/staff", requireStaff, (c) => handleListStaff(c))
  .post("/admin/staff", requireAdmin, zValidator("json", createStaffSchema), (c) => handleCreateStaff(c))
  .put("/admin/staff/:id", requireAdmin, zValidator("json", updateStaffSchema), (c) => handleUpdateStaff(c))
  .delete("/admin/staff/:id", requireAdmin, (c) => handleDeleteStaff(c))
  .get("/admin/users", requireStaff, (c) => handleLegacyUsers(c));

export default router;
