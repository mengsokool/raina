import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "@raina/db";
import { sealIntegrationConfig, openIntegrationConfig } from "../lib/crypto";
import { unsafeUrlReason } from "@raina/workflow";
import integrationsRouter from "../modules/integrations";
import { executeActionNode } from "../lib/engine";

// Mock @raina/db prisma
vi.mock("@raina/db", () => {
  const store = {
    integrations: new Map<string, any>(),
    auditLogs: [] as any[],
  };

  return {
    prisma: {
      integration: {
        findMany: vi.fn(async ({ where }: any) => {
          let list = Array.from(store.integrations.values());
          if (where?.projectId) {
            list = list.filter((i) => i.projectId === where.projectId);
          }
          if (where?.archivedAt === null) {
            list = list.filter((i) => i.archivedAt === null || i.archivedAt === undefined);
          }
          return list;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          for (const item of store.integrations.values()) {
            if (where.id && item.id !== where.id) continue;
            if (where.projectId && item.projectId !== where.projectId) continue;
            if (where.archivedAt === null && item.archivedAt !== null && item.archivedAt !== undefined) continue;
            return item;
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const item = { ...data };
          store.integrations.set(data.id, item);
          return item;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = store.integrations.get(where.id);
          if (!item) throw new Error("not found");
          const updated = { ...item, ...data };
          store.integrations.set(where.id, updated);
          return updated;
        }),
        delete: vi.fn(async ({ where }: any) => {
          store.integrations.delete(where.id);
          return { id: where.id };
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          store.auditLogs.push(data);
          return { id: store.auditLogs.length, ...data };
        }),
        findMany: vi.fn(async () => store.auditLogs),
      },
      _store: store,
    },
  };
});

// Mock auth to act as staff
vi.mock("../lib/auth", () => ({
  requireStaff: async (c: any, next: any) => {
    c.set("user", { id: "user_admin_1", email: "admin@raina.test", role: "admin" });
    c.set("userId", "user_admin_1");
    await next();
  },
  authenticateSession: async () => ({
    id: "user_admin_1",
    email: "admin@raina.test",
    role: "admin",
  }),
}));

describe("Integrations Subsystem Security & Hardening", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (prisma as any)._store.integrations.clear();
    (prisma as any)._store.auditLogs.length = 0;
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("1. At-Rest Secret Cryptographic Sealing", () => {
    it("seals sensitive configuration into AES-GCM ciphertext", async () => {
      const sensitiveConfig = {
        bot_token: "super-secret-telegram-token-xyz-12345",
        api_key: "ak_live_99887766554433221100",
      };

      const sealed = await sealIntegrationConfig(sensitiveConfig);

      // Must be prefixed with v1:
      expect(sealed.startsWith("v1:")).toBe(true);

      // Ciphertext must NOT contain plaintext secrets
      expect(sealed).not.toContain("super-secret-telegram-token");
      expect(sealed).not.toContain("ak_live_99887766554433221100");

      // Decryption round-trip recovers the exact payload
      const unsealed = await openIntegrationConfig(sealed);
      expect(JSON.parse(unsealed)).toEqual(sensitiveConfig);
    });

    it("handles backward compatibility for legacy plaintext configs", async () => {
      const legacyConfig = JSON.stringify({ webhook_url: "https://example.com/hook" });
      const recovered = await openIntegrationConfig(legacyConfig);
      expect(recovered).toBe(legacyConfig);
    });
  });

  describe("2. SSRF Guard & Defense-in-Depth", () => {
    it("rejects loopback and private IPv4 addresses", () => {
      expect(unsafeUrlReason("http://127.0.0.1:8080/hook")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://localhost:3000/webhook")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://192.168.1.50/api")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://10.0.0.1/admin")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://172.16.0.1/metrics")).toBe("url targets an internal host");
    });

    it("rejects cloud metadata service (169.254.169.254)", () => {
      expect(unsafeUrlReason("http://169.254.169.254/latest/meta-data/")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://metadata.google.internal/computeMetadata/v1/")).toBe("url targets an internal host");
    });

    it("rejects internal Docker and single-label container hostnames", () => {
      expect(unsafeUrlReason("http://postgres:5432/db")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://emqx:18083/api/v5")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://redis:6379/")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://timescaledb:5432/")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://host.docker.internal:8000/hook")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://backend.internal/endpoint")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://mydevice.local/control")).toBe("url targets an internal host");
    });

    it("rejects IP-in-domain bypasses (nip.io, sslip.io)", () => {
      expect(unsafeUrlReason("http://127.0.0.1.nip.io/webhook")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://192.168.0.1.sslip.io/test")).toBe("url targets an internal host");
      expect(unsafeUrlReason("http://10.0.0.1.xip.io/")).toBe("url targets an internal host");
    });

    it("rejects integer decimal IP bypasses", () => {
      // 2130706433 is 127.0.0.1
      expect(unsafeUrlReason("http://2130706433/webhook")).toBe("url targets an internal host");
    });

    it("allows valid public webhook URLs", () => {
      expect(unsafeUrlReason("https://hooks.slack.com/services/T00/B00/XXXX")).toBeNull();
      expect(unsafeUrlReason("https://discord.com/api/webhooks/123/abc")).toBeNull();
      expect(unsafeUrlReason("https://api.telegram.org/bot12345/sendMessage")).toBeNull();
      expect(unsafeUrlReason("https://api.mycompany.com/v1/telemetry-hook")).toBeNull();
    });
  });

  describe("3. API Lifecycle: Schema Validation & Masking", () => {
    const app = new Hono();
    app.route("/", integrationsRouter);

    it("validates create payload and rejects invalid kind", async () => {
      const res = await app.request("/projects/proj_test/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Invalid Integration",
          kind: "unsupported_provider",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("validation_failed");
    });

    it("creates integration with encrypted config and returns masked config in list", async () => {
      const createRes = await app.request("/projects/proj_test/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Telegram Alerts",
          kind: "telegram",
          config: {
            bot_token: "123456789:ABCDefGhIjKlMnOpQrStUvWxYz",
            chat_id: "-100998877",
          },
        }),
      });

      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      // Verify the stored record in DB is encrypted at rest
      const storedRow = (prisma as any)._store.integrations.get(created.id);
      expect(storedRow.config.startsWith("v1:")).toBe(true);
      expect(storedRow.config).not.toContain("123456789:ABCDefGhIjKlMnOpQrStUvWxYz");

      // Verify listing returns masked secrets
      const listRes = await app.request("/projects/proj_test/integrations");
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      const found = list.find((i: any) => i.id === created.id);
      expect(found).toBeDefined();
      expect(found.config.bot_token).toBe("••••WxYz");
      expect(found.config.chat_id).toBe("-100998877"); // non-secret key not masked
    });

    it("prevents overwriting secrets when updating with masked values", async () => {
      // 1. Create integration with bot_token
      const createRes = await app.request("/projects/proj_test/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Slack Ops",
          kind: "slack",
          config: {
            webhook_url: "https://hooks.slack.com/services/T1/B1/SECRETTOKEN99",
            channel: "#alerts",
          },
        }),
      });
      const created = await createRes.json();

      // 2. Client sends update with masked secret (as typically returned by UI)
      const updateRes = await app.request(`/projects/proj_test/integrations/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Slack Ops Renamed",
          config: {
            webhook_url: "••••EN99", // Masked value sent back
            channel: "#general",      // New channel
          },
        }),
      });
      expect(updateRes.status).toBe(200);

      // 3. Verify that the stored secret was NOT overwritten with '••••EN99'
      const storedRow = (prisma as any)._store.integrations.get(created.id);
      const decrypted = JSON.parse(await openIntegrationConfig(storedRow.config));
      expect(decrypted.webhook_url).toBe("https://hooks.slack.com/services/T1/B1/SECRETTOKEN99");
      expect(decrypted.channel).toBe("#general");
    });

    it("performs soft-delete and hides archived integration from list and engine", async () => {
      // 1. Create integration
      const createRes = await app.request("/projects/proj_test/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Temp Integration",
          kind: "http_service",
          config: { url: "https://example.com/api" },
        }),
      });
      const created = await createRes.json();

      // 2. Soft-delete
      const delRes = await app.request(`/projects/proj_test/integrations/${created.id}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);

      // 3. Stored row must have archivedAt set (not physically deleted)
      const storedRow = (prisma as any)._store.integrations.get(created.id);
      expect(storedRow).toBeDefined();
      expect(storedRow.archivedAt).toBeDefined();

      // 4. Listing should not return the archived integration
      const listRes = await app.request("/projects/proj_test/integrations");
      const list = await listRes.json();
      expect(list.some((i: any) => i.id === created.id)).toBe(false);

      // 5. Automation engine step node should fail gracefully with "not found"
      const dummyGraph = { id: "g1", name: "test", trigger: { id: "t1", kind: "telemetry", config: {} }, nodes: [], edges: [] } as any;
      const stepResult = await executeActionNode(
        { id: "node_1", kind: "call_integration", config: { integration_id: created.id } } as any,
        {
          source: "telemetry",
          projectId: "proj_test",
          ts: Date.now(),
          variable: "temp",
          value: 25,
        },
        "proj_test",
        "auto_1",
        dummyGraph
      );
      expect(stepResult.status).toBe("error");
      expect(stepResult.detail).toContain("Integration not found");
    });

    it("records audit logs for lifecycle operations", async () => {
      // 1. Create
      const createRes = await app.request("/projects/proj_audit/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Audit Test",
          kind: "slack",
          config: { webhook_url: "https://hooks.slack.com/services/1/2/3" },
        }),
      });
      const created = await createRes.json();

      // 2. Update
      await app.request(`/projects/proj_audit/integrations/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Audit Test Updated" }),
      });

      // 3. Delete
      await app.request(`/projects/proj_audit/integrations/${created.id}`, {
        method: "DELETE",
      });

      const logs = (prisma as any)._store.auditLogs;
      const actions = logs.map((l: any) => l.action);

      expect(actions).toContain("integration.create");
      expect(actions).toContain("integration.update");
      expect(actions).toContain("integration.delete");
    });
  });

  describe("4. End-to-End Engine Execution with Encrypted Config", () => {
    it("unseals config and successfully executes external integration in engine", async () => {
      (global.fetch as any).mockResolvedValue({ ok: true, status: 200 });

      // Create sealed integration directly in store
      const plainConfig = {
        url: "https://example.com/webhook",
        method: "POST",
        body_template: '{"alert":"high_temp","val":{{value}}}',
      };
      const sealedConfig = await sealIntegrationConfig(plainConfig);

      (prisma as any)._store.integrations.set("int_engine_test", {
        id: "int_engine_test",
        projectId: "proj_engine",
        name: "Engine Webhook",
        kind: "http_service",
        config: sealedConfig,
        enabled: true,
        archivedAt: null,
      });

      const dummyGraph = { id: "g1", name: "test", trigger: { id: "t1", kind: "telemetry", config: {} }, nodes: [], edges: [] } as any;
      const stepResult = await executeActionNode(
        {
          id: "node_int_1",
          kind: "call_integration",
          config: {
            integration_id: "int_engine_test",
          },
        } as any,
        {
          source: "telemetry",
          projectId: "proj_engine",
          ts: Date.now(),
          variable: "temp",
          value: 85,
        },
        "proj_engine",
        "auto_1",
        dummyGraph
      );

      expect(stepResult.status).toBe("ok");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ alert: "high_temp", val: 85 }),
        })
      );
    });
  });
});
