import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "@raina/server";
import { readJson } from "./http";

export const API_BASE_URL =
  typeof window === "undefined"
    ? process.env.INTERNAL_API_URL || "http://127.0.0.1:3001"
    : "";

/** Single unified Hono RPC Client instance */
export const client = hc<AppType>(API_BASE_URL, {
  // Keep the cookie-based session attached for both the admin app and the
  // public dashboard's optional authenticated mode. This is explicit because
  // browser defaults differ once the API base URL is configured.
  init: { credentials: "include" },
});

/* -------------------------------------------------------------------------- */
/* Auth Domain                                                                */
/* -------------------------------------------------------------------------- */
const signInEndpoint = client.v1.auth["sign-in"].$post;
const meEndpoint = client.v1.auth.me.$get;

export async function getBootstrapStatus(): Promise<{ bootstrap: boolean; requiresSetupToken: boolean }> {
  return readJson(await client.v1.public["bootstrap-status"].$get());
}

export async function bootstrapOwner(json: {
  email: string;
  username: string;
  password: string;
  setupToken?: string;
}): Promise<{ token: string }> {
  return readJson(await client.v1.auth.bootstrap.$post({ json }));
}

export type SignInResponse = InferResponseType<typeof signInEndpoint, 200>;
export type CurrentUser = InferResponseType<typeof meEndpoint, 200>;
export type ProfileResponse = InferResponseType<typeof client.v1.auth.profile.$patch, 200>;

export async function signIn(json: {
  identifier?: string;
  username?: string;
  email?: string;
  password: string;
}): Promise<SignInResponse> {
  return readJson<SignInResponse>(await client.v1.auth["sign-in"].$post({ json }));
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return readJson<CurrentUser>(await client.v1.auth.me.$get());
}

export async function signOut(): Promise<{ success: boolean }> {
  return readJson<{ success: boolean }>(await client.v1.auth["sign-out"].$post());
}

export async function updateProfile(json: {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<ProfileResponse> {
  return readJson<ProfileResponse>(await client.v1.auth.profile.$patch({ json }));
}

/* -------------------------------------------------------------------------- */
/* Projects Domain                                                            */
/* -------------------------------------------------------------------------- */
export type ProjectList = InferResponseType<typeof client.v1.admin.projects.$get, 200>;
export type Project = InferResponseType<typeof client.v1.admin.projects.$post, 200>;

export async function listProjects(): Promise<ProjectList> {
  return readJson<ProjectList>(await client.v1.admin.projects.$get());
}

export async function getProject(proj: string): Promise<Project> {
  return readJson<Project>(await client.v1.admin.projects[":proj"].$get({ param: { proj } }));
}

export async function createProject(json: { name: string; description?: string }): Promise<Project> {
  return readJson<Project>(await client.v1.admin.projects.$post({ json }));
}

export async function updateProject(
  proj: string,
  json: { name?: string; description?: string },
): Promise<Project> {
  return readJson<Project>(await client.v1.admin.projects[":proj"].$put({ param: { proj }, json }));
}

export async function deleteProject(proj: string): Promise<{ success: boolean; id: string }> {
  return readJson<{ success: boolean; id: string }>(
    await client.v1.admin.projects[":proj"].$delete({ param: { proj } })
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboards Domain                                                          */
/* -------------------------------------------------------------------------- */
const listDashboardsEndpoint = client.v1.dashboards.$get;
const getDashboardEndpoint = client.v1.dashboards[":id"].$get;
const getAccessEndpoint = client.v1.dashboards[":id"].access.$get;
const shareTokenEndpoint = client.v1.dashboards[":id"]["share-token"].$post;

export type DashboardList = InferResponseType<typeof listDashboardsEndpoint, 200>;
export type Dashboard = InferResponseType<typeof getDashboardEndpoint, 200>;
export type DashboardAccess = InferResponseType<typeof getAccessEndpoint, 200>;
export type ShareTokenResponse = InferResponseType<typeof shareTokenEndpoint, 200>;

export async function listDashboards(projectId?: string): Promise<DashboardList> {
  const query = projectId ? { project_id: projectId } : {};
  return readJson<DashboardList>(await client.v1.dashboards.$get({ query }));
}

export async function getDashboard(id: string, projectId?: string): Promise<Dashboard> {
  const query = projectId ? { project_id: projectId } : {};
  return readJson<Dashboard>(await client.v1.dashboards[":id"].$get({ param: { id }, query }));
}

export async function getPublicDashboard(token: string): Promise<Dashboard> {
  return readJson<Dashboard>(await client.v1.dashboards.public[":token"].$get({ param: { token } }));
}

export async function createDashboard(json: {
  title?: string;
  name?: string;
  description?: string | null;
  projectId?: string;
  project_id?: string;
  visibility?: string;
  widgets?: Record<string, unknown>[];
}): Promise<Dashboard> {
  return readJson<Dashboard>(await client.v1.dashboards.$post({ json }));
}

export async function updateDashboard(
  id: string,
  json: {
    title?: string;
    name?: string;
    description?: string | null;
    layout?: Record<string, unknown>;
    widgets?: Record<string, unknown>[];
    visibility?: string;
    mobile?: unknown;
  }
): Promise<Dashboard> {
  return readJson<Dashboard>(await client.v1.dashboards[":id"].$put({ param: { id }, json }));
}

export async function deleteDashboard(id: string): Promise<{ success: boolean; id: string }> {
  return readJson<{ success: boolean; id: string }>(await client.v1.dashboards[":id"].$delete({ param: { id } }));
}

export async function generateShareToken(
  id: string,
  json?: { visibility?: string; regenerate?: boolean }
): Promise<ShareTokenResponse> {
  return readJson<ShareTokenResponse>(
    await client.v1.dashboards[":id"]["share-token"].$post({ param: { id }, json: json || {} })
  );
}

export async function revokeShareToken(id: string): Promise<ShareTokenResponse> {
  return readJson<ShareTokenResponse>(
    await client.v1.dashboards[":id"]["share-token"].$delete({ param: { id } })
  );
}

export async function getDashboardAccess(id: string): Promise<DashboardAccess> {
  return readJson<DashboardAccess>(await client.v1.dashboards[":id"].access.$get({ param: { id } }));
}

export async function updateDashboardAccess(
  id: string,
  users: Array<{ userId: string; hasAccess: boolean; canControl?: boolean }>
): Promise<{ success: boolean; dashboardId: string }> {
  return readJson<{ success: boolean; dashboardId: string }>(
    await client.v1.dashboards[":id"].access.$put({ param: { id }, json: { users } })
  );
}

/* -------------------------------------------------------------------------- */
/* Variables Domain                                                           */
/* -------------------------------------------------------------------------- */
const listVariablesEndpoint = client.v1.admin.projects[":proj"].variables.$get;
const createVariableEndpoint = client.v1.projects[":proj"].variables.$post;
const getProjectStateEndpoint = client.v1.projects[":proj"].state.$get;

export type VariableList = InferResponseType<typeof listVariablesEndpoint, 200>;
export type Variable = InferResponseType<typeof createVariableEndpoint, 200>;
export type ProjectState = InferResponseType<typeof getProjectStateEndpoint, 200>;

export async function listVariables(proj: string): Promise<VariableList> {
  return readJson<VariableList>(await client.v1.admin.projects[":proj"].variables.$get({ param: { proj } }));
}

export async function createVariable(
  proj: string,
  json: { key: string; unit?: string; defaultValue?: string }
): Promise<Variable> {
  return readJson<Variable>(await client.v1.projects[":proj"].variables.$post({ param: { proj }, json }));
}

export async function deleteVariable(proj: string, id: string): Promise<{ success: boolean; id: string; key: string }> {
  return readJson<{ success: boolean; id: string; key: string }>(
    await client.v1.admin.projects[":proj"].variables[":id"].$delete({ param: { proj, id } })
  );
}

export async function updateVariable(
  proj: string,
  id: string,
  json: { unit?: string | null }
): Promise<Variable> {
  return readJson<Variable>(
    await client.v1.admin.projects[":proj"].variables[":id"].$patch({
      param: { proj, id },
      json: { unit: json.unit ?? undefined },
    })
  );
}

export async function getProjectState(proj: string): Promise<ProjectState> {
  return readJson<ProjectState>(await client.v1.projects[":proj"].state.$get({ param: { proj } }));
}

/* -------------------------------------------------------------------------- */
/* Devices & Tokens Domain                                                    */
/* -------------------------------------------------------------------------- */
const listDevicesEndpoint = client.v1.admin.projects[":proj"].devices.$get;
const createDeviceEndpoint = client.v1.admin.projects[":proj"].devices.$post;
const listTokensEndpoint = client.v1.admin.projects[":proj"].tokens.$get;
const createTokenEndpoint = client.v1.admin.projects[":proj"].tokens.$post;

export type DeviceList = InferResponseType<typeof listDevicesEndpoint, 200>;
export type Device = InferResponseType<typeof createDeviceEndpoint, 200>;
export type TokenList = InferResponseType<typeof listTokensEndpoint, 200>;
export type CreatedToken = InferResponseType<typeof createTokenEndpoint, 201>;

export async function listDevices(proj: string): Promise<DeviceList> {
  return readJson<DeviceList>(await client.v1.admin.projects[":proj"].devices.$get({ param: { proj } }));
}

export async function createDevice(
  proj: string,
  json: { name: string; chip?: string; device_key?: string }
): Promise<Device> {
  return readJson<Device>(await client.v1.admin.projects[":proj"].devices.$post({ param: { proj }, json }));
}

export async function renameDevice(
  proj: string,
  id: string,
  name: string
): Promise<{ id: string; name: string }> {
  return readJson<{ id: string; name: string }>(
    await client.v1.admin.projects[":proj"].devices[":id"].$patch({ param: { proj, id }, json: { name } })
  );
}

export async function deleteDevice(proj: string, id: string): Promise<{ success: boolean; id: string }> {
  return readJson<{ success: boolean; id: string }>(
    await client.v1.admin.projects[":proj"].devices[":id"].$delete({ param: { proj, id } })
  );
}

export async function assignFirmware(
  proj: string,
  id: string,
  firmwareId: string | null
): Promise<{ id: string; desired_firmware_id: string | null }> {
  return readJson<{ id: string; desired_firmware_id: string | null }>(
    await client.v1.admin.projects[":proj"].devices[":id"].firmware.$post({
      param: { proj, id },
      json: { firmware_id: firmwareId },
    })
  );
}

export async function listTokens(proj: string): Promise<TokenList> {
  return readJson<TokenList>(await client.v1.admin.projects[":proj"].tokens.$get({ param: { proj } }));
}

export async function createToken(proj: string, json?: { name?: string }): Promise<CreatedToken> {
  return readJson<CreatedToken>(
    await client.v1.admin.projects[":proj"].tokens.$post({ param: { proj }, json: json || {} })
  );
}

export async function revokeToken(proj: string, id: string): Promise<{ id: string; revoked_at: number }> {
  return readJson<{ id: string; revoked_at: number }>(
    await client.v1.admin.projects[":proj"].tokens[":id"].revoke.$post({ param: { proj, id } })
  );
}

/* -------------------------------------------------------------------------- */
/* Automations Domain                                                         */
/* -------------------------------------------------------------------------- */
const listAutomationsEndpoint = client.v1.admin.projects[":proj"].automations.$get;
const createAutomationEndpoint = client.v1.admin.projects[":proj"].automations.$post;
const draftAutomationEndpoint = client.v1.admin.projects[":proj"].automations.draft.$post;
const runAutomationEndpoint = client.v1.admin.projects[":proj"].automations[":id"].run.$post;
const listAutomationRunsEndpoint = client.v1.admin.projects[":proj"].automations[":id"].runs.$get;

export type AutomationList = InferResponseType<typeof listAutomationsEndpoint, 200>;
export type Automation = InferResponseType<typeof createAutomationEndpoint, 201>;
export type AutomationRunResult = InferResponseType<typeof runAutomationEndpoint, 200>;
export type AutomationRuns = InferResponseType<typeof listAutomationRunsEndpoint, 200>;
export type AutomationDraft = InferResponseType<typeof draftAutomationEndpoint, 200>;

export async function generateAutomationDraft(proj: string, prompt: string, timezone: string): Promise<AutomationDraft> {
  return readJson<AutomationDraft>(await client.v1.admin.projects[":proj"].automations.draft.$post({
    param: { proj }, json: { prompt, timezone },
  }));
}

export async function listAutomations(proj: string): Promise<AutomationList> {
  return readJson<AutomationList>(await client.v1.admin.projects[":proj"].automations.$get({ param: { proj } }));
}

export async function createAutomation(
  proj: string,
  json: {
    name?: string;
    description?: string | null;
    enabled?: boolean;
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
    actions?: unknown[];
    graph?: Record<string, unknown>;
  }
): Promise<Automation> {
  return readJson<Automation>(
    await client.v1.admin.projects[":proj"].automations.$post({ param: { proj }, json })
  );
}

export async function updateAutomation(
  proj: string,
  id: string,
  json: {
    name?: string;
    description?: string | null;
    enabled?: boolean;
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
    actions?: unknown[];
    graph?: Record<string, unknown>;
  }
): Promise<{
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: string;
  updated_at: number;
}> {
  return readJson(
    await client.v1.admin.projects[":proj"].automations[":id"].$patch({
      param: { proj, id },
      json,
    })
  );
}

export async function deleteAutomation(
  proj: string,
  id: string
): Promise<{ success: boolean; id: string }> {
  return readJson<{ success: boolean; id: string }>(
    await client.v1.admin.projects[":proj"].automations[":id"].$delete({
      param: { proj, id },
    })
  );
}

export async function runAutomation(
  proj: string,
  id: string,
  json?: { variable?: string; value?: unknown; payload?: Record<string, unknown> }
): Promise<AutomationRunResult> {
  return readJson<AutomationRunResult>(
    await client.v1.admin.projects[":proj"].automations[":id"].run.$post({
      param: { proj, id },
      json: json || {},
    })
  );
}

export async function listAutomationRuns(
  proj: string,
  id: string,
  limit?: number
): Promise<AutomationRuns> {
  return readJson<AutomationRuns>(
    await client.v1.admin.projects[":proj"].automations[":id"].runs.$get({
      param: { proj, id },
      query: limit ? { limit: String(limit) } : {},
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Control Domain                                                             */
/* -------------------------------------------------------------------------- */
export type ControlResponse = InferResponseType<typeof client.v1.control.$post, 200>;

export async function sendControl(
  proj: string,
  variable: string,
  value: unknown,
  deviceId?: string
): Promise<ControlResponse> {
  return readJson<ControlResponse>(
    await client.v1.control.$post({
      json: {
        project_id: proj,
        variable,
        value,
        device_id: deviceId,
      },
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Staff & Users Domain                                                       */
/* -------------------------------------------------------------------------- */
export type StaffList = InferResponseType<typeof client.v1.admin.staff.$get, 200>;
export type StaffUser = InferResponseType<typeof client.v1.admin.staff.$post, 200>;

export async function listStaff(): Promise<StaffList> {
  return readJson<StaffList>(await client.v1.admin.staff.$get());
}

export async function createStaff(json: {
  username: string;
  name?: string;
  email?: string;
  password: string;
  role?: "admin" | "staff";
}): Promise<StaffUser> {
  return readJson<StaffUser>(await client.v1.admin.staff.$post({ json }));
}

export async function updateStaff(
  id: string,
  json: { name?: string; email?: string; role?: string; password?: string }
): Promise<StaffUser> {
  return readJson<StaffUser>(await client.v1.admin.staff[":id"].$put({ param: { id }, json }));
}

export async function deleteStaff(id: string): Promise<{ success: boolean; id: string }> {
  return readJson<{ success: boolean; id: string }>(await client.v1.admin.staff[":id"].$delete({ param: { id } }));
}

const listProjectUsersEndpoint = client.v1.admin.projects[":proj"].users.$get;
const createProjectUserEndpoint = client.v1.admin.projects[":proj"].users.$post;

export type ProjectUserList = InferResponseType<typeof listProjectUsersEndpoint, 200>;
export type ProjectUser = InferResponseType<typeof createProjectUserEndpoint, 200>;

export async function listProjectUsers(proj: string): Promise<ProjectUserList> {
  return readJson<ProjectUserList>(await client.v1.admin.projects[":proj"].users.$get({ param: { proj } }));
}

export async function createProjectUser(
  proj: string,
  json: {
    username: string;
    password: string;
    name?: string;
    email?: string;
    role?: string;
    accessAllDashboards?: boolean;
    dashboardIds?: string[];
  }
): Promise<ProjectUser> {
  return readJson<ProjectUser>(
    await client.v1.admin.projects[":proj"].users.$post({ param: { proj }, json })
  );
}

export async function updateProjectUser(
  proj: string,
  userId: string,
  json: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    accessAllDashboards?: boolean;
    dashboardIds?: string[];
  }
): Promise<ProjectUser> {
  return readJson<ProjectUser>(
    await client.v1.admin.projects[":proj"].users[":userId"].$put({
      param: { proj, userId },
      json,
    })
  );
}

export async function deleteProjectUser(
  proj: string,
  userId: string
): Promise<{ success: boolean; userId: string }> {
  return readJson<{ success: boolean; userId: string }>(
    await client.v1.admin.projects[":proj"].users[":userId"].$delete({
      param: { proj, userId },
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Integrations Domain                                                        */
/* -------------------------------------------------------------------------- */
const listIntegrationsEndpoint = client.v1.admin.projects[":proj"].integrations.$get;
const createIntegrationEndpoint = client.v1.admin.projects[":proj"].integrations.$post;
const testIntegrationEndpoint = client.v1.admin.projects[":proj"].integrations[":id"].test.$post;

export type IntegrationList = InferResponseType<typeof listIntegrationsEndpoint, 200>;
export type Integration = InferResponseType<typeof createIntegrationEndpoint, 201>;
export type IntegrationTestResult = InferResponseType<typeof testIntegrationEndpoint, 200>;

export async function listIntegrations(proj: string): Promise<IntegrationList> {
  return readJson<IntegrationList>(
    await client.v1.admin.projects[":proj"].integrations.$get({ param: { proj } })
  );
}

export async function createIntegration(
  proj: string,
  json: {
    name: string;
    kind: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }
): Promise<Integration> {
  return readJson<Integration>(
    await client.v1.admin.projects[":proj"].integrations.$post({
      param: { proj },
      json: json as any,
    })
  );
}

export async function updateIntegration(
  proj: string,
  id: string,
  json: {
    name?: string;
    kind?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }
): Promise<{
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  updated_at: number;
}> {
  return readJson(
    await client.v1.admin.projects[":proj"].integrations[":id"].$patch({
      param: { proj, id },
      json: json as any,
    })
  );
}

export async function deleteIntegration(
  proj: string,
  id: string
): Promise<{ success: boolean; id: string }> {
  return readJson<{ success: boolean; id: string }>(
    await client.v1.admin.projects[":proj"].integrations[":id"].$delete({
      param: { proj, id },
    })
  );
}

export async function testIntegration(
  proj: string,
  id: string,
  json?: {
    variable?: string;
    value?: unknown;
    event?: string;
    payload?: Record<string, unknown>;
    message?: string;
    operation?: string;
    params?: Record<string, unknown>;
  }
): Promise<IntegrationTestResult> {
  return readJson<IntegrationTestResult>(
    await client.v1.admin.projects[":proj"].integrations[":id"].test.$post({
      param: { proj, id },
      json: json || {},
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Diagnostics Domain                                                         */
/* -------------------------------------------------------------------------- */
export type Diagnostics = InferResponseType<typeof client.v1.admin.diagnostics.$get, 200>;

export async function getDiagnostics(): Promise<Diagnostics> {
  return readJson<Diagnostics>(await client.v1.admin.diagnostics.$get());
}
