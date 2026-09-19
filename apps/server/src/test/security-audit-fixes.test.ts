import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../index";
import { prisma } from "@raina/db";
import crypto from "crypto";
import { extractClientIp, checkLoginRateLimit, resetLoginRateLimit } from "../modules/identity";
import { getOrCreateDefaultDevice } from "../services/telemetry.service";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

vi.mock("@raina/db", () => ({
  prisma: {
    dashboard: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    projectVariable: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    telemetry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    automation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    account: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    projectMember: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
    },
    dashboardAccess: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    device: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    projectToken: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    project: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../lib/emqx", () => ({
  initEmqx: vi.fn(),
  closeEmqx: vi.fn(),
  publishDeviceCommand: vi.fn(),
}));

describe("Security Audit Remediation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. [dashboards.access-result-truthiness] Rejects unauthorized client from viewing private/users_only dashboard", async () => {
    const dashObj = {
      id: "dsh_secret",
      name: "Private Project Dashboard",
      description: "",
      visibility: "users_only",
      projectId: "prj_alpha",
      shareToken: "tok_share_123",
      layout: JSON.stringify({ items: [] }),
    };
    (prisma.dashboard.findFirst as any).mockResolvedValue(dashObj);
    (prisma.dashboard.findUnique as any).mockResolvedValue(dashObj);

    (prisma.session.findUnique as any).mockResolvedValue({
      token: "tok_client_session",
      expiresAt: BigInt(Date.now() + 3600000),
      user: {
        id: "usr_client",
        role: "client",
        email: "client@example.com",
      },
    });

    (prisma.projectMember.findUnique as any).mockResolvedValue({
      userId: "usr_client",
      projectId: "prj_alpha",
      accessAllDashboards: false,
    });

    // Client does NOT have access to dsh_secret
    (prisma.dashboardAccess.findUnique as any).mockResolvedValue(null);

    const res = await app.request("/v1/dashboards/public/tok_share_123", {
      method: "GET",
      headers: {
        Authorization: "Bearer tok_client_session",
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("2. [identity.project-users.global-account-password-reset] Staff cannot reset password or delete admin/owner accounts", async () => {
    (prisma.session.findUnique as any).mockResolvedValue({
      token: "tok_staff",
      expiresAt: BigInt(Date.now() + 3600000),
      user: {
        id: "usr_staff_caller",
        role: "staff",
      },
    });

    (prisma.user.findUnique as any).mockResolvedValue({
      id: "usr_platform_admin",
      username: "admin_boss",
      role: "admin",
    });

    // Staff trying to reset password of Admin
    const updateRes = await app.request("/v1/admin/projects/prj_alpha/users/usr_platform_admin", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok_staff",
      },
      body: JSON.stringify({
        password: "NewHackedPassword123!",
      }),
    });

    expect(updateRes.status).toBe(403);
    const updateBody = await updateRes.json();
    expect(updateBody.error).toContain("Cannot modify a user with equal or higher role");

    // Staff trying to delete Admin
    const deleteRes = await app.request("/v1/admin/projects/prj_alpha/users/usr_platform_admin", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer tok_staff",
      },
    });

    expect(deleteRes.status).toBe(403);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.error).toContain("Cannot delete a user with equal or higher role");

    // Staff trying to promote a client to admin
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "usr_regular_client",
      username: "some_client",
      role: "client",
    });

    const promoteRes = await app.request("/v1/admin/projects/prj_alpha/users/usr_regular_client", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok_staff",
      },
      body: JSON.stringify({
        role: "admin",
      }),
    });

    expect(promoteRes.status).toBe(403);
    const promoteBody = await promoteRes.json();
    expect(promoteBody.error).toContain("Cannot assign a role equal to or higher than your own");
  });

  it("3. [mqtt.authAcl.unboundProjectPrincipal] MQTT auth denies cross-project username binding", async () => {
    const rawToken = "ptk_token_for_proj_a";
    (prisma.projectToken.findUnique as any).mockResolvedValue({
      id: "tok_a",
      projectId: "prj_A",
      revokedAt: null,
    });

    // Client attempts to claim username: "prj_B" using Token of prj_A
    const res = await app.request("/v1/emqx/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientid: "esp32_01",
        username: "prj_B",
        password: rawToken,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBe("deny");
  });

  it("4. [mqtt.auth.deviceTokenBindingOverwrite] MQTT auth denies token binding overwrite on existing device", async () => {
    const rawToken = "ptk_second_token";
    (prisma.projectToken.findUnique as any).mockResolvedValue({
      id: "tok_2",
      projectId: "prj_alpha",
      revokedAt: null,
    });

    (prisma.device.findFirst as any).mockResolvedValue({
      id: "dev_weather_station",
      deviceKey: "dev_weather_station",
      tokenId: "tok_1_original", // Already bound to tok_1!
    });

    const res = await app.request("/v1/emqx/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientid: "dev_weather_station",
        username: "prj_alpha",
        password: rawToken,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBe("deny");
  });

  it("5. [telemetry.device-token-binding-fallback] Telemetry fallback default device detects token conflict", async () => {
    (prisma.device.findFirst as any).mockResolvedValue({
      id: "dev_default_proj",
      projectId: "prj_main",
      isDefault: true,
      tokenId: "tok_owner",
    });

    await expect(
      getOrCreateDefaultDevice("prj_main", undefined, "tok_secondary")
    ).rejects.toThrow("Device ownership conflict: Default device is registered to another hardware token");
  });

  it("6. [identity.sign-in.forwarded-address-rate-key] Extracts client IP safely from forwarded headers", () => {
    const dummyContext = {
      req: {
        header: (name: string) => {
          if (name === "x-real-ip") return undefined;
          if (name === "x-forwarded-for") return "1.1.1.1, 2.2.2.2, 198.51.100.42";
          return undefined;
        },
      },
    } as any;

    expect(extractClientIp(dummyContext)).toBe("198.51.100.42");
  });

  it("7. [dashboards.realtime-project-scope] Dashboard stream filters out variables not present in dashboard layout", async () => {
    const dashWithWidgets = {
      id: "dsh_filtered",
      name: "Widget Filtered Dashboard",
      visibility: "public",
      projectId: "prj_alpha",
      layout: JSON.stringify({
        items: [
          { props: { variable: "temperature" } },
        ],
      }),
    };
    (prisma.dashboard.findFirst as any).mockResolvedValue(dashWithWidgets);
    (prisma.dashboard.findUnique as any).mockResolvedValue(dashWithWidgets);
    (prisma.projectVariable.findMany as any).mockResolvedValue([
      { key: "temperature", value: "24.5" },
      { key: "secret_api_key", value: "sk_live_secret999" },
    ]);

    const res = await app.request("/v1/dashboards/dsh_filtered/stream", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const chunk1 = await reader!.read();
    const text1 = new TextDecoder().decode(chunk1.value);

    const chunk2 = await reader!.read();
    const text2 = new TextDecoder().decode(chunk2.value);
    const combined = text1 + text2;

    // Look for snapshot data
    expect(combined).toContain('"temperature":24.5');
    expect(combined).not.toContain("secret_api_key");

    await reader!.cancel();
  });
});
