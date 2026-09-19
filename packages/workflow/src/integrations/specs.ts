import type { ConnSpec } from "./types";

export const HTTP_SERVICE_SPEC: ConnSpec = {
  kind: "http_service",
  label: "HTTP service",
  description: "Send an HTTP request to any URL, optionally HMAC-signed.",
  icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m-9 9h18",
  executable: true,
  fields: [
    { key: "url", label: "URL", type: "url", required: true, mono: true, placeholder: "https://api.example.com/…" },
    { key: "method", label: "Method", type: "select", options: ["POST", "GET", "PUT", "PATCH", "DELETE"], default: "POST" },
    { key: "headers", label: "Headers (JSON, optional)", type: "json", mono: true, placeholder: '{ "authorization": "Bearer …" }' },
    {
      key: "body_template",
      label: "Body template (optional)",
      type: "textarea",
      mono: true,
      placeholder: '{ "content": "{{value}}" }',
      hint: "Sent for non-GET requests; defaults to the full trigger event as JSON. {{variable}}, {{value}}, {{event}} are interpolated.",
    },
    {
      key: "secret",
      label: "Signing secret (optional)",
      type: "text",
      mono: true,
      placeholder: "shared secret",
      hint: "Adds an X-Raina-Signature HMAC-SHA256 header over the request body so the receiver can verify it.",
    },
  ],
  summary: { template: "{{method:POST}} {{url:—}}" },
};

export const EMAIL_SPEC: ConnSpec = {
  kind: "email",
  label: "Email",
  description: "Send an email via Resend, with a templated subject and body.",
  icon: "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75",
  executable: true,
  fields: [
    { key: "api_key", label: "Resend API key", type: "text", required: true, mono: true, placeholder: "re_…", hint: "Create one at resend.com → API Keys. Stored server-side." },
    { key: "from", label: "From", type: "text", required: true, placeholder: "Alerts <alerts@yourdomain.com>", hint: "Must use a domain you've verified in Resend." },
    { key: "to", label: "To", type: "text", required: true, placeholder: "ops@example.com", hint: "One address, or several separated by commas." },
    { key: "subject", label: "Subject", type: "text", placeholder: "{{variable}} alert" },
    { key: "body", label: "Body", type: "textarea", placeholder: "{{variable}} is now {{value}}", hint: "Plain text. {{variable}}, {{value}}, {{event}} are interpolated." },
  ],
  operations: [{ key: "send", label: "Send email", params: ["to", "subject", "body"] }],
  summary: { template: "from {{from}}", requires: "from", fallback: "Not configured" },
};

export const TELEGRAM_SPEC: ConnSpec = {
  kind: "telegram",
  label: "Telegram",
  description: "Send a message to a Telegram chat or channel via a bot.",
  icon: "M21.5 4.5 2.5 11.8c-.9.35-.9 1.55 0 1.9l4.6 1.55 1.75 5.5c.25.78 1.27.96 1.78.3l2.4-3.1 4.6 3.4c.7.5 1.7.1 1.85-.75L22.4 5.7c.2-1.05-.85-1.6-.9-1.2Z",
  executable: true,
  fields: [
    { key: "bot_token", label: "Bot token", type: "text", required: true, mono: true, placeholder: "123456:ABC-…", hint: "From @BotFather. Bot must be in the chat." },
    { key: "chat_id", label: "Chat ID", type: "text", required: true, mono: true, placeholder: "-1001234567890 or @channelname", hint: "Numeric ID, or @username." },
    { key: "message", label: "Message", type: "textarea", required: true, placeholder: "{{variable}} = {{value}}", hint: "Supports {{variable}}, {{value}}, {{event}}." },
  ],
  operations: [{ key: "send_message", label: "Send message", params: ["message"] }],
  summary: { value: "Telegram bot", requires: "bot_token", fallback: "No bot token set" },
};

export const SLACK_SPEC: ConnSpec = {
  kind: "slack",
  label: "Slack",
  description: "Post a message to a Slack channel via an incoming webhook.",
  icon: "M5.25 14.25a2.25 2.25 0 1 1-2.25-2.25h2.25v2.25Zm1.5 0a2.25 2.25 0 0 1 4.5 0v5.25a2.25 2.25 0 0 1-4.5 0v-5.25Zm2.25-9a2.25 2.25 0 1 1 2.25-2.25v2.25H9Zm0 1.5a2.25 2.25 0 0 1 0 4.5H3.75a2.25 2.25 0 0 1 0-4.5H9Zm9.75 2.25a2.25 2.25 0 1 1 2.25 2.25h-2.25V9Zm-1.5 0a2.25 2.25 0 0 1-4.5 0V3.75a2.25 2.25 0 0 1 4.5 0V9Zm-2.25 9a2.25 2.25 0 1 1-2.25 2.25v-2.25H15Zm0-1.5a2.25 2.25 0 0 1 0-4.5h5.25a2.25 2.25 0 0 1 0 4.5H15Z",
  executable: true,
  fields: [
    { key: "webhook_url", label: "Incoming webhook URL", type: "url", required: true, mono: true, placeholder: "https://hooks.slack.com/services/…", hint: "Treated as a secret." },
    { key: "message", label: "Message", type: "textarea", required: true, placeholder: "{{variable}} = {{value}}", hint: "Supports {{variable}}, {{value}}, {{event}}." },
  ],
  operations: [{ key: "send_message", label: "Send message", params: ["message"] }],
  summary: { value: "Slack channel", requires: "webhook_url", fallback: "No webhook set" },
};

export const DISCORD_SPEC: ConnSpec = {
  kind: "discord",
  label: "Discord",
  description: "Post a message to a Discord channel via a channel webhook.",
  icon: "M19.5 5.5A16 16 0 0 0 15.5 4.3l-.25.5a14.5 14.5 0 0 1 3.6 1.15 13 13 0 0 0-11.7 0A14.5 14.5 0 0 1 10.75 4.8L10.5 4.3A16 16 0 0 0 6.5 5.5C3.9 9.4 3.2 13.2 3.5 16.95a16.1 16.1 0 0 0 4.9 2.5l.55-.95a10.5 10.5 0 0 1-1.65-.8l.4-.3a11.5 11.5 0 0 0 9.6 0l.4.3a10.5 10.5 0 0 1-1.65.8l.55.95a16.1 16.1 0 0 0 4.9-2.5c.35-4.3-.6-8.05-2.9-11.45ZM9.25 14.7c-.95 0-1.75-.9-1.75-2s.78-2 1.75-2 1.77.9 1.75 2c0 1.1-.78 2-1.75 2Zm5.5 0c-.95 0-1.75-.9-1.75-2s.78-2 1.75-2 1.77.9 1.75 2c0 1.1-.78 2-1.75 2Z",
  executable: true,
  fields: [
    { key: "webhook_url", label: "Channel webhook URL", type: "url", required: true, mono: true, placeholder: "https://discord.com/api/webhooks/…", hint: "Treated as a secret." },
    { key: "message", label: "Message", type: "textarea", required: true, placeholder: "{{variable}} = {{value}}", hint: "Supports {{variable}}, {{value}}, {{event}}." },
    { key: "title", label: "Title", type: "text", placeholder: "{{variable}} alert", hint: "Embed title." },
    { key: "description", label: "Description", type: "textarea", placeholder: "{{variable}} is now {{value}}", hint: "Embed body." },
  ],
  operations: [
    { key: "send_message", label: "Send message", params: ["message"] },
    { key: "send_embed", label: "Send embed", params: ["title", "description"] },
  ],
  summary: { value: "Discord channel", requires: "webhook_url", fallback: "No webhook set" },
};

export const TWILIO_SPEC: ConnSpec = {
  kind: "twilio",
  label: "Twilio",
  description: "Send SMS or WhatsApp messages via Twilio.",
  icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z",
  executable: true,
  fields: [
    { key: "account_sid", label: "Account SID", type: "text", required: true, mono: true, placeholder: "AC…" },
    { key: "auth_token", label: "Auth token", type: "text", required: true, mono: true, placeholder: "your_auth_token" },
    { key: "sms_from", label: "SMS sender", type: "text", mono: true, placeholder: "+15551234567 or a Messaging Service SID" },
    { key: "whatsapp_from", label: "WhatsApp sender", type: "text", mono: true, placeholder: "+14155238886" },
    { key: "to", label: "To", type: "text", required: true, mono: true, placeholder: "+15557654321" },
    { key: "message", label: "Message", type: "textarea", required: true, placeholder: "{{variable}} = {{value}}" },
  ],
  operations: [
    { key: "send_sms", label: "Send SMS", params: ["to", "message"] },
    { key: "send_whatsapp", label: "Send WhatsApp", params: ["to", "message"] },
  ],
  summary: { value: "Twilio (SMS / WhatsApp)", requires: "account_sid", fallback: "Not configured" },
};

export const MS_TEAMS_SPEC: ConnSpec = {
  kind: "ms_teams",
  label: "Microsoft Teams",
  description: "Post a message to a Teams channel via an incoming webhook.",
  icon: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  executable: true,
  fields: [
    { key: "webhook_url", label: "Incoming webhook URL", type: "url", required: true, mono: true, placeholder: "https://…webhook.office.com/…" },
    { key: "message", label: "Message", type: "textarea", required: true, placeholder: "{{variable}} = {{value}}" },
  ],
  operations: [{ key: "send_message", label: "Send message", params: ["message"] }],
  summary: { value: "Teams channel", requires: "webhook_url", fallback: "No webhook set" },
};

export const PAGERDUTY_SPEC: ConnSpec = {
  kind: "pagerduty",
  label: "PagerDuty",
  description: "Trigger an alert via the PagerDuty Events API v2.",
  icon: "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5",
  executable: true,
  fields: [
    { key: "routing_key", label: "Integration key", type: "text", required: true, mono: true, placeholder: "32-character routing key" },
    { key: "summary", label: "Summary", type: "textarea", required: true, placeholder: "{{variable}} = {{value}}" },
    { key: "severity", label: "Severity", type: "select", options: ["critical", "error", "warning", "info"], default: "warning" },
    { key: "source", label: "Source", type: "text", placeholder: "{{variable}}" },
    { key: "dedup_key", label: "Dedup key", type: "text", mono: true, placeholder: "optional" },
  ],
  operations: [{ key: "trigger_alert", label: "Trigger alert", params: ["summary", "severity", "source", "dedup_key"] }],
  summary: { value: "PagerDuty alert", requires: "routing_key", fallback: "No integration key set" },
};

export const CATALOG: readonly ConnSpec[] = [
  HTTP_SERVICE_SPEC,
  EMAIL_SPEC,
  TELEGRAM_SPEC,
  SLACK_SPEC,
  DISCORD_SPEC,
  TWILIO_SPEC,
  MS_TEAMS_SPEC,
  PAGERDUTY_SPEC,
];
