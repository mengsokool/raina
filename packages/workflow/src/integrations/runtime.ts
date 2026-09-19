import type {
  IntegrationContext,
  IntegrationResult,
  IntegrationRow,
  IntegrationInvocation,
} from "./types";
import { interpolate } from "./index";
import {
  runHttpService,
  runEmail,
  runTelegram,
  runSlack,
  runDiscord,
  runTwilio,
  runMsTeams,
  runPagerDuty,
} from "./handlers";

export async function executeIntegration(
  integration: IntegrationRow,
  ctx: IntegrationContext,
  inv?: IntegrationInvocation
): Promise<IntegrationResult> {
  if (integration.enabled !== 1) return { status: "skipped", detail: "disabled" };

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(integration.config) as Record<string, unknown>;
  } catch {
    config = {};
  }

  const body = buildPayload(ctx);
  const params = resolveParams(inv?.params, body);
  const op = inv?.operation;

  switch (integration.kind) {
    case "http_service":
      return runHttpService(config, body);
    case "email":
      return runEmail(config, params, op);
    case "telegram":
      return runTelegram(config, params, op);
    case "slack":
      return runSlack(config, params, op);
    case "discord":
      return runDiscord(config, params, op);
    case "twilio":
      return runTwilio(config, params, op);
    case "ms_teams":
      return runMsTeams(config, params, op);
    case "pagerduty":
      return runPagerDuty(config, params, op);
    default:
      return { status: "skipped", detail: `kind '${integration.kind}' not executable yet` };
  }
}

function resolveParams(
  params: Record<string, unknown> | undefined,
  body: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    out[k] = typeof v === "string" ? interpolate(v, body) : v;
  }
  return out;
}

function buildPayload(ctx: IntegrationContext): Record<string, unknown> {
  return {
    source: ctx.source,
    project_id: ctx.projectId,
    ts: ctx.ts,
    variable: ctx.variable ?? null,
    value: ctx.value ?? null,
    event: ctx.event ?? null,
    ...(ctx.payload ?? {}),
  };
}
