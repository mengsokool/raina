export type ConnFieldType =
  | "text"
  | "url"
  | "textarea"
  | "json"
  | "select"
  | "code"
  | "number"
  | "boolean";

export type ConnField = {
  key: string;
  label: string;
  type: ConnFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  options?: readonly string[];
  default?: string;
};

export type SummaryDescriptor = {
  template?: string;
  value?: string;
  requires?: string;
  fallback?: string;
};

export type ConnOperation = {
  key: string;
  label: string;
  description?: string;
  params: readonly string[];
};

export type IntegrationKind =
  | "http_service"
  | "email"
  | "telegram"
  | "slack"
  | "discord"
  | "twilio"
  | "ms_teams"
  | "pagerduty";

export type ConnSpec = {
  kind: IntegrationKind;
  label: string;
  description: string;
  icon: string;
  executable: boolean;
  fields: readonly ConnField[];
  operations?: readonly ConnOperation[];
  summary: SummaryDescriptor;
};

export type IntegrationRow = {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  config: string;
  enabled: number;
};

export type Integration = {
  id: string;
  project_id: string;
  name: string;
  kind: IntegrationKind;
  config: unknown;
  enabled: boolean;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  last_run_at: number | null;
  last_run_status: "ok" | "error" | "skipped" | null;
  last_error: string | null;
};

export type IntegrationResult = {
  status: "ok" | "error" | "skipped";
  detail?: string;
};

export type IntegrationContext = {
  source: string;
  projectId: string;
  ts: number;
  variable?: string;
  value?: unknown;
  event?: string;
  payload?: Record<string, unknown>;
};

export type IntegrationInvocation = {
  operation?: string;
  params?: Record<string, unknown>;
};
