import type { IntegrationResult } from "./types";
import { doFetch, hmacHex, str, strRecord } from "./lib";

const RAINA_ACCENT = 0x10b981;

export async function runDiscord(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  operation?: string
): Promise<IntegrationResult> {
  const url = str(config.webhook_url);
  if (!url) return { status: "error", detail: "missing webhook_url" };

  let payload: Record<string, unknown>;
  if (operation === "send_embed") {
    const title = str(params.title);
    const description = str(params.description);
    if (!title && !description) return { status: "error", detail: "embed needs a title or description" };
    const embed: Record<string, unknown> = { color: RAINA_ACCENT };
    if (title) embed.title = title;
    if (description) embed.description = description;
    payload = { embeds: [embed] };
  } else {
    payload = { content: str(params.message) || str(params.content) || "Raina notification" };
  }

  return doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function runTelegram(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  _operation?: string
): Promise<IntegrationResult> {
  const token = str(config.bot_token);
  if (!token) return { status: "error", detail: "missing bot_token" };
  const chatId = str(config.chat_id);
  if (!chatId) return { status: "error", detail: "missing chat_id" };

  const text = str(params.message) || "Raina notification";

  return doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function runSlack(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  _operation?: string
): Promise<IntegrationResult> {
  const url = str(config.webhook_url);
  if (!url) return { status: "error", detail: "missing webhook_url" };

  const text = str(params.message) || "Raina notification";

  return doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function runEmail(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  _operation?: string
): Promise<IntegrationResult> {
  const apiKey = str(config.api_key);
  if (!apiKey) return { status: "error", detail: "missing api_key" };
  const from = str(config.from);
  if (!from) return { status: "error", detail: "missing from" };
  const to = str(params.to);
  if (!to) return { status: "error", detail: "missing to" };

  const subject = str(params.subject) || "Raina notification";
  const text = str(params.body) || subject;
  const recipients = to.includes(",") ? to.split(",").map((s) => s.trim()).filter(Boolean) : to;

  return doFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: recipients, subject, text }),
  });
}

export async function runHttpService(
  config: Record<string, unknown>,
  body: Record<string, unknown>
): Promise<IntegrationResult> {
  const url = str(config.url);
  if (!url) return { status: "error", detail: "missing url" };

  const method = (str(config.method) || "POST").toUpperCase();
  const headers: Record<string, string> = strRecord(config.headers);
  const init: RequestInit = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    const template = str(config.body_template);
    init.body = template ? interpolateTemplate(template, body) : JSON.stringify(body);
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
  }

  const secret = str(config.secret);
  if (secret && typeof init.body === "string") {
    const signature = await hmacHex(secret, init.body);
    headers["x-raina-signature"] = signature;
  }

  return doFetch(url, init);
}

const wa = (n: string): string => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);

export async function runTwilio(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  operation?: string
): Promise<IntegrationResult> {
  const sid = str(config.account_sid);
  if (!sid) return { status: "error", detail: "missing account_sid" };
  const token = str(config.auth_token);
  if (!token) return { status: "error", detail: "missing auth_token" };

  const isWhatsApp = operation === "send_whatsapp";
  const fromKey = isWhatsApp ? "whatsapp_from" : "sms_from";
  const from = str(config[fromKey]);
  if (!from) return { status: "error", detail: `missing ${fromKey}` };
  const to = str(params.to);
  if (!to) return { status: "error", detail: "missing to" };

  const body = new URLSearchParams({
    To: isWhatsApp ? wa(to) : to,
    From: isWhatsApp ? wa(from) : from,
    Body: str(params.message) || "Raina notification",
  });

  return doFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${sid}:${token}`)}`,
    },
    body: body.toString(),
  });
}

export async function runMsTeams(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  _operation?: string
): Promise<IntegrationResult> {
  const url = str(config.webhook_url);
  if (!url) return { status: "error", detail: "missing webhook_url" };

  const text = str(params.message) || "Raina notification";

  return doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ "@type": "MessageCard", "@context": "https://schema.org/extensions", text }),
  });
}

const SEVERITIES = new Set(["critical", "error", "warning", "info"]);

export async function runPagerDuty(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  _operation?: string
): Promise<IntegrationResult> {
  const routingKey = str(config.routing_key);
  if (!routingKey) return { status: "error", detail: "missing routing_key" };

  const severity = SEVERITIES.has(str(params.severity)) ? str(params.severity) : "warning";
  const dedupKey = str(params.dedup_key);

  return doFetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: "trigger",
      ...(dedupKey ? { dedup_key: dedupKey } : {}),
      payload: {
        summary: str(params.summary) || "Raina notification",
        source: str(params.source) || "raina",
        severity,
      },
    }),
  });
}

function interpolateTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
