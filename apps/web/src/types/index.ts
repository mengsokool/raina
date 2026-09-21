import type {
  AutomationGraph,
  GraphNode,
  GraphEdge,
  Automation,
  AutomationTriggerType,
  Integration,
  IntegrationKind,
  ConnField,
} from "@raina/workflow";

export type {
  AutomationGraph,
  GraphNode,
  GraphEdge,
  Automation,
  AutomationTriggerType,
  Integration,
  IntegrationKind,
  ConnField,
};

export type InstanceRole = "owner" | "admin" | "staff" | "member" | "client";

export type ProjectRef = { id: string; name: string };

export type DashboardAccessRef = {
  dashboardId: string;
  dashboardName?: string;
  canControl: boolean;
};

export type User = {
  id: string;
  email?: string | null;
  username?: string | null;
  role: InstanceRole;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  last_login_at?: number | null;
  created_at?: number;
  updated_at?: number;
};

export type ProjectUser = {
  id: string;
  username: string;
  email?: string | null;
  name?: string | null;
  role: string;
  accessAllDashboards: boolean;
  dashboardAccess: DashboardAccessRef[];
  createdAt: number;
};

export type Project = {
  id: string;
  name: string;
  created_at: number;
  description?: string | null;
  updated_at?: number;
  archived_at?: number | null;
};

export type InstanceUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: InstanceRole;
  last_login_at: number | null;
  created_at: number;
  projects: ProjectRef[];
};

export type Variable = {
  id: string;
  key: string;
  unit?: string | null;
  created_at: number;
  updated_at: number;
  last_seen: number | null;
};

export type Device = {
  id: string;
  name: string;
  chip: string | null;
  firmware_version: string | null;
  is_default: number;
  first_seen: number | null;
  last_seen: number | null;
  desired_firmware_id: string | null;
  ota_status: string | null;
};

export type ProjectToken = {
  id: string;
  name?: string | null;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
  devices?: Device[];
};

export type ProjectTokenWithSecret = ProjectToken & { token: string };

export type WidgetType =
  | "iot-value"
  | "iot-gauge"
  | "iot-chart"
  | "iot-toggle"
  | "iot-push"
  | "iot-slider"
  | "iot-color"
  | "iot-percent"
  | (string & {});

export type WidgetInstance = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: WidgetType;
  props: Record<string, unknown>;
};

export type MobilePlacement = { id: string; x: number; y: number; w: number; h: number };

export type Layout = {
  grid?: { columns: number };
  items: WidgetInstance[];
  device?: string | null;
  mobile?: { items: MobilePlacement[] } | null;
  refresh?: number;
};

export type DashboardMeta = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  description?: string | null;
  visibility?: "private" | "public" | "users_only" | "disabled";
  share_token?: string | null;
  archived_at?: number | null;
};

export type Dashboard = DashboardMeta & {
  layout: Layout;
};

export type PublicDashboard = {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  project_id: string;
  layout: Layout;
};

export type CompactSeries = Record<string, { t: number[]; v: number[] }>;

export type PublicState = {
  variables: Record<string, { value: unknown; received_at: number }>;
  series: CompactSeries;
};

export type ShareState = {
  id: string;
  visibility: "private" | "public" | "users_only" | "disabled";
  share_token: string | null;
  updated_at: number;
};

export type AuditLogEntry = {
  id: number;
  project_id: string | null;
  project_name: string | null;
  user_id: string | null;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
  created_at: number;
};

export type SseSnapshotMsg = {
  type: "snapshot";
  projectId: string;
  variables: Record<string, unknown>;
  series: CompactSeries;
  timestamp: number;
};

export type SseTelemetryMsg = {
  type: "telemetry";
  projectId: string;
  deviceId: string;
  variable: string;
  value: unknown;
  timestamp: number;
};

export type SseControlMsg = {
  type: "control";
  projectId: string;
  deviceId?: string;
  variable: string;
  value: unknown;
  timestamp: number;
};

export type SseDeviceStatusMsg = {
  type: "device_status";
  projectId: string;
  deviceId: string;
  status: "online" | "offline";
  timestamp: number;
};

export type SseAutomationEventMsg = {
  type: "automation_event";
  projectId: string;
  event: string;
  context?: Record<string, unknown>;
  timestamp: number;
};

export type SseMsg =
  | SseSnapshotMsg
  | SseTelemetryMsg
  | SseControlMsg
  | SseDeviceStatusMsg
  | SseAutomationEventMsg;
