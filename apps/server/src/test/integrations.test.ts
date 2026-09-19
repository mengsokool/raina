import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { integrations } from "@raina/workflow";

describe("Integrations System & Runtime Handlers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("interpolates template variables correctly", () => {
    const tpl = "Alert for {{variable}}: value is {{value}} from {{source}}";
    const vars = { variable: "tank_level", value: "98%", source: "telemetry" };
    expect(integrations.interpolate(tpl, vars)).toBe(
      "Alert for tank_level: value is 98% from telemetry"
    );
  });

  it("handles missing interpolation keys cleanly", () => {
    const tpl = "Device {{device}} reported {{missing}}";
    expect(integrations.interpolate(tpl, { device: "node_1" })).toBe(
      "Device node_1 reported "
    );
  });

  it("executes http_service (webhook) integration successfully", async () => {
    const mockResponse = { ok: true, status: 200 };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const integrationRow: integrations.IntegrationRow = {
      id: "int_webhook_1",
      project_id: "proj_1",
      name: "Custom Webhook",
      kind: "http_service",
      config: JSON.stringify({
        url: "https://example.com/api/webhook",
        method: "POST",
      }),
      enabled: 1,
    };

    const ctx: integrations.IntegrationContext = {
      source: "telemetry",
      projectId: "proj_1",
      ts: Date.now(),
      variable: "humidity",
      value: 82,
    };

    const res = await integrations.executeIntegration(integrationRow, ctx);
    expect(res.status).toBe("ok");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/api/webhook",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("executes discord webhook with interpolated message", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, status: 204 });

    const integrationRow: integrations.IntegrationRow = {
      id: "int_discord_1",
      project_id: "proj_1",
      name: "Discord Alert",
      kind: "discord",
      config: JSON.stringify({
        webhook_url: "https://discord.com/api/webhooks/123/abc",
      }),
      enabled: 1,
    };

    const ctx: integrations.IntegrationContext = {
      source: "telemetry",
      projectId: "proj_1",
      ts: Date.now(),
      variable: "pressure",
      value: 120,
    };

    const res = await integrations.executeIntegration(integrationRow, ctx, {
      params: {
        content: "Warning: {{variable}} reached {{value}}!",
      },
    });

    expect(res.status).toBe("ok");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/123/abc",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "Warning: pressure reached 120!",
        }),
      })
    );
  });

  it("executes telegram message integration", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, status: 200 });

    const integrationRow: integrations.IntegrationRow = {
      id: "int_telegram_1",
      project_id: "proj_1",
      name: "Telegram Alert",
      kind: "telegram",
      config: JSON.stringify({
        bot_token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        chat_id: "-100123456789",
      }),
      enabled: 1,
    };

    const ctx: integrations.IntegrationContext = {
      source: "telemetry",
      projectId: "proj_1",
      ts: Date.now(),
      variable: "leak",
      value: "detected",
    };

    const res = await integrations.executeIntegration(integrationRow, ctx, {
      params: {
        text: "Water leak: {{value}}",
      },
    });

    expect(res.status).toBe("ok");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage"),
      expect.anything()
    );
  });

  it("skips execution when integration is disabled", async () => {
    const disabledRow: integrations.IntegrationRow = {
      id: "int_disabled_1",
      project_id: "proj_1",
      name: "Slack Disabled",
      kind: "slack",
      config: JSON.stringify({ webhook_url: "https://hooks.slack.com/services/..." }),
      enabled: 0,
    };

    const res = await integrations.executeIntegration(disabledRow, {
      source: "manual",
      projectId: "proj_1",
      ts: Date.now(),
    });

    expect(res.status).toBe("skipped");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
