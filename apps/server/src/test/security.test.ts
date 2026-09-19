import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../index";
import { validatePassword, checkLoginRateLimit, resetLoginRateLimit, getSessionCookieHeader } from "../modules/identity";
import { verifyControlPermission } from "../lib/auth";
import { prisma } from "@raina/db";

// Mock database and external modules
vi.mock("@raina/db", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    account: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    project: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    projectMember: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    dashboard: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    dashboardAccess: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    projectVariable: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    device: {
      findFirst: vi.fn().mockResolvedValue({ id: "dev_default" }),
      update: vi.fn().mockResolvedValue({ id: "dev_default", name: "Renamed" }),
      delete: vi.fn().mockResolvedValue({ id: "dev_default" }),
    },
    telemetry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    integration: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    automation: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../lib/emqx", () => ({
  initEmqx: vi.fn(),
  closeEmqx: vi.fn(),
  publishDeviceCommand: vi.fn(),
  getEmqxStatus: vi.fn().mockReturnValue({ connected: true, url: "tcp://localhost:1883" }),
}));

vi.mock("../lib/events", () => ({
  broadcastControl: vi.fn(),
  broadcastEvent: vi.fn(),
  broadcastTelemetry: vi.fn(),
  eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

describe("Authentication & Password Policy", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("")).toBe("Password is required");
    expect(validatePassword("12345")).toBe("Password must be at least 8 characters long");
    expect(validatePassword("short")).toBe("Password must be at least 8 characters long");
    expect(validatePassword("1234567")).toBe("Password must be at least 8 characters long");
  });

  it("accepts valid passwords with 8 or more characters", () => {
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("secure_password_123")).toBeNull();
  });
});

describe("First owner setup", () => {
  it("requires the private setup token in production", async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousToken = process.env.SETUP_TOKEN;
    process.env.NODE_ENV = "production";
    process.env.SETUP_TOKEN = "private-setup-token";

    try {
      const response = await app.request("/v1/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "owner", email: "owner@example.com", password: "long-password", setupToken: "wrong" }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Invalid setup token" });
    } finally {
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
      if (previousToken === undefined) delete process.env.SETUP_TOKEN;
      else process.env.SETUP_TOKEN = previousToken;
    }
  });
});

describe("Session cookies", () => {
  it("uses Secure for HTTPS and permits HTTP on a local install", () => {
    const previousUrl = process.env.PUBLIC_API_URL;
    try {
      process.env.PUBLIC_API_URL = "http://localhost:3001";
      expect(getSessionCookieHeader("token")).not.toContain("; Secure");
      process.env.PUBLIC_API_URL = "https://api.example.com";
      expect(getSessionCookieHeader("token")).toContain("; Secure");
    } finally {
      if (previousUrl === undefined) delete process.env.PUBLIC_API_URL;
      else process.env.PUBLIC_API_URL = previousUrl;
    }
  });
});

describe("Brute Force & Login Rate Limiting", () => {
  const testIp = "192.168.1.100";

  beforeEach(() => {
    resetLoginRateLimit(testIp);
  });

  it("allows up to 10 login attempts within window", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkLoginRateLimit(testIp)).toBe(true);
    }
  });

  it("blocks the 11th login attempt with rate limit exceeded", () => {
    for (let i = 0; i < 10; i++) {
      checkLoginRateLimit(testIp);
    }
    expect(checkLoginRateLimit(testIp)).toBe(false);
  });

  it("returns HTTP 429 when rate limit is exceeded on /v1/auth/sign-in", async () => {
    const rateLimitIp = "10.0.0.99";
    resetLoginRateLimit(rateLimitIp);

    // Exhaust attempts
    for (let i = 0; i < 10; i++) {
      checkLoginRateLimit(rateLimitIp);
    }

    const res = await app.request("/v1/auth/sign-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": rateLimitIp,
      },
      body: JSON.stringify({ identifier: "admin", password: "wrong_password" }),
    });

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain("Too many login attempts");
  });
});

describe("Hardware Control Permission (Least Privilege)", () => {
  it("allows owner, admin, and staff full control permission", async () => {
    expect(await verifyControlPermission("user1", "owner", "prj_1")).toBe(true);
    expect(await verifyControlPermission("user2", "admin", "prj_1")).toBe(true);
    expect(await verifyControlPermission("user3", "staff", "prj_1")).toBe(true);
  });

  it("rejects client who is not a project member", async () => {
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce(null);
    expect(await verifyControlPermission("client1", "client", "prj_1")).toBe(false);
  });

  it("allows client with accessAllDashboards", async () => {
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      userId: "client1",
      projectId: "prj_1",
      role: "client",
      accessAllDashboards: true,
      addedAt: BigInt(Date.now()),
      addedBy: null,
    });
    expect(await verifyControlPermission("client1", "client", "prj_1")).toBe(true);
  });

  it("rejects client when canControl is false on all assigned dashboards", async () => {
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      userId: "client1",
      projectId: "prj_1",
      role: "client",
      accessAllDashboards: false,
      addedAt: BigInt(Date.now()),
      addedBy: null,
    });
    vi.mocked(prisma.dashboardAccess.findFirst).mockResolvedValueOnce(null);

    expect(await verifyControlPermission("client1", "client", "prj_1")).toBe(false);
  });

  it("allows client when canControl is true on an assigned dashboard", async () => {
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      userId: "client1",
      projectId: "prj_1",
      role: "client",
      accessAllDashboards: false,
      addedAt: BigInt(Date.now()),
      addedBy: null,
    });
    vi.mocked(prisma.dashboardAccess.findFirst).mockResolvedValueOnce({
      id: "da_1",
      userId: "client1",
      projectId: "prj_1",
      dashboardId: "dash_1",
      canControl: true,
      createdAt: BigInt(Date.now()),
    });

    expect(await verifyControlPermission("client1", "client", "prj_1")).toBe(true);
  });
});

describe("Critical Fix Verification: Guard Inversion & Unauthenticated Access", () => {
  beforeEach(() => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
  });

  it("rejects unauthenticated GET /v1/dashboards with 401", async () => {
    const res = await app.request("/v1/dashboards", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated GET /v1/admin/projects/prj_1/dashboards with 401", async () => {
    const res = await app.request("/v1/admin/projects/prj_1/dashboards", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated POST /v1/dashboards with 401", async () => {
    const res = await app.request("/v1/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacked Dashboard", projectId: "prj_1" }),
    });
    expect(res.status).toBe(401);
  });

  it("SEC-01 Guard Inversion Fix: rejects unauthenticated DELETE /v1/dashboards/:id with 401", async () => {
    const res = await app.request("/v1/dashboards/dsh_target123", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("SEC-01 Guard Inversion Fix: rejects unauthenticated PUT /v1/dashboards/:id with 401", async () => {
    const res = await app.request("/v1/dashboards/dsh_target123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Tampered Name" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated POST /v1/dashboards/:id/share-token with 401", async () => {
    const res = await app.request("/v1/dashboards/dsh_target123/share-token", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated GET /v1/dashboards/:id/access with 401", async () => {
    const res = await app.request("/v1/dashboards/dsh_target123/access", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("SEC-02 Fix: rejects unauthenticated GET /v1/projects/:proj/telemetry/history with 401", async () => {
    const res = await app.request("/v1/projects/prj_1/telemetry/history?variable=temp", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("Integrations Auth Fix: rejects unauthenticated GET /v1/admin/projects/:proj/integrations with 401", async () => {
    const res = await app.request("/v1/admin/projects/prj_1/integrations", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated POST /v1/control with 401", async () => {
    const res = await app.request("/v1/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "prj_1", variable: "relay", value: 1 }),
    });
    expect(res.status).toBe(401);
  });
});

describe("RBAC Role Boundaries: Client vs Staff/Admin", () => {
  const clientSession = {
    id: "sess_client",
    token: "tok_client",
    userId: "user_client",
    expiresAt: BigInt(Date.now() + 1000000),
    ipAddress: null,
    userAgent: null,
    createdAt: BigInt(Date.now()),
    updatedAt: BigInt(Date.now()),
    user: {
      id: "user_client",
      username: "client_user",
      email: "client@example.com",
      role: "client",
      name: "Client User",
    },
  };

  beforeEach(() => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(clientSession as any);
  });

  it("rejects Client user creating a dashboard with 403 Forbidden", async () => {
    const res = await app.request("/v1/dashboards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer tok_client",
      },
      body: JSON.stringify({ name: "Client Made Dashboard", projectId: "prj_1" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects Client user deleting a dashboard with 403 Forbidden", async () => {
    const res = await app.request("/v1/dashboards/dsh_1", {
      method: "DELETE",
      headers: { "Authorization": "Bearer tok_client" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects Client user managing staff with 403 Forbidden", async () => {
    const res = await app.request("/v1/admin/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer tok_client",
      },
      body: JSON.stringify({ username: "new_staff", password: "Password123" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects Client user accessing integrations with 403 Forbidden", async () => {
    const res = await app.request("/v1/admin/projects/prj_1/integrations", {
      method: "GET",
      headers: { "Authorization": "Bearer tok_client" },
    });
    expect(res.status).toBe(403);
  });

  it("SEC-05 Fix: rejects Read-Only Client attempting POST /v1/control with 403 Forbidden", async () => {
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      userId: "user_client",
      projectId: "prj_1",
      role: "client",
      accessAllDashboards: false,
      addedAt: BigInt(Date.now()),
      addedBy: null,
    });
    vi.mocked(prisma.dashboardAccess.findFirst).mockResolvedValueOnce(null);

    const res = await app.request("/v1/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer tok_client",
      },
      body: JSON.stringify({ projectId: "prj_1", variable: "motor_switch", value: 1 }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("do not have permission to control devices");
  });
});

describe("Positive Tests: Legitimate Operations for Authorized Roles", () => {
  const adminSession = {
    id: "sess_admin",
    token: "tok_admin",
    userId: "user_admin",
    expiresAt: BigInt(Date.now() + 1000000),
    ipAddress: null,
    userAgent: null,
    createdAt: BigInt(Date.now()),
    updatedAt: BigInt(Date.now()),
    user: {
      id: "user_admin",
      username: "admin_user",
      email: "admin@example.com",
      role: "admin",
      name: "Admin User",
    },
  };

  const staffSession = {
    id: "sess_staff",
    token: "tok_staff",
    userId: "user_staff",
    expiresAt: BigInt(Date.now() + 1000000),
    ipAddress: null,
    userAgent: null,
    createdAt: BigInt(Date.now()),
    updatedAt: BigInt(Date.now()),
    user: {
      id: "user_staff",
      username: "staff_user",
      email: "staff@example.com",
      role: "staff",
      name: "Staff User",
    },
  };

  const clientSession = {
    id: "sess_client_authorized",
    token: "tok_client_auth",
    userId: "user_client_auth",
    expiresAt: BigInt(Date.now() + 1000000),
    ipAddress: null,
    userAgent: null,
    createdAt: BigInt(Date.now()),
    updatedAt: BigInt(Date.now()),
    user: {
      id: "user_client_auth",
      username: "authorized_client",
      email: "client_auth@example.com",
      role: "client",
      name: "Authorized Client",
    },
  };

  it("Authorized Admin can create a new staff account", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(adminSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null); // username check
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "staff_new",
      username: "staff_operator",
      email: null,
      name: "Operator",
      role: "staff",
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
    } as any);

    const res = await app.request("/v1/admin/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer tok_admin",
      },
      body: JSON.stringify({ username: "staff_operator", password: "StrongPassword123" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("staff_operator");
  });

  it("Authorized Staff can create a new dashboard in a project", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(staffSession as any);
    vi.mocked(prisma.dashboard.create).mockResolvedValueOnce({
      id: "dsh_created",
      projectId: "prj_1",
      name: "Factory Floor",
      description: null,
      layout: JSON.stringify({ grid: { columns: 24 }, items: [] }),
      visibility: "private",
      shareToken: null,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
    } as any);

    const res = await app.request("/v1/dashboards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer tok_staff",
      },
      body: JSON.stringify({ title: "Factory Floor", projectId: "prj_1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Factory Floor");
  });

  it("Authorized Client with canControl=true can execute hardware control", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(clientSession as any);
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      userId: "user_client_auth",
      projectId: "prj_1",
      role: "client",
      accessAllDashboards: false,
      addedAt: BigInt(Date.now()),
      addedBy: null,
    });
    vi.mocked(prisma.dashboardAccess.findFirst).mockResolvedValueOnce({
      id: "da_allow",
      userId: "user_client_auth",
      projectId: "prj_1",
      dashboardId: "dash_valve",
      canControl: true,
      createdAt: BigInt(Date.now()),
    });

    const res = await app.request("/v1/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer tok_client_auth",
      },
      body: JSON.stringify({ projectId: "prj_1", variable: "valve_1", value: 1 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("Authorized Client can read their permitted dashboard", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(clientSession as any);
    vi.mocked(prisma.dashboard.findFirst).mockResolvedValueOnce({
      id: "dsh_viewable",
      projectId: "prj_1",
      name: "Tank Levels",
      description: "Water tank metrics",
      layout: JSON.stringify({ grid: { columns: 24 }, items: [] }),
      visibility: "private",
      shareToken: null,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      archivedAt: null,
    } as any);
    vi.mocked(prisma.dashboard.findUnique).mockResolvedValueOnce({
      id: "dsh_viewable",
      projectId: "prj_1",
    } as any);
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      userId: "user_client_auth",
      projectId: "prj_1",
      role: "client",
      accessAllDashboards: true,
      addedAt: BigInt(Date.now()),
      addedBy: null,
    });

    const res = await app.request("/v1/dashboards/dsh_viewable", {
      method: "GET",
      headers: { "Authorization": "Bearer tok_client_auth" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Tank Levels");
  });
});
