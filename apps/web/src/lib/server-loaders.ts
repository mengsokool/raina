import { client } from "./api-client";
import { readJson } from "./http";

export function getAuthHeaders(request?: Request | string | null): Record<string, string> {
  if (!request) return {};
  const cookieStr = typeof request === "string" ? request : request.headers.get("cookie");
  return cookieStr ? { cookie: cookieStr } : {};
}

export async function getServerUser(request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any>(await client.v1.auth.me.$get({}, { headers }));
  } catch {
    return null;
  }
}

export async function getServerProjects(request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.projects.$get({}, { headers }));
  } catch {
    return [];
  }
}

export async function getServerStaff(request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.staff.$get({}, { headers }));
  } catch {
    return [];
  }
}

export async function getServerDiagnostics(request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any>(await client.v1.admin.diagnostics.$get({}, { headers }));
  } catch {
    return null;
  }
}

export async function getServerDashboards(proj?: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    const query = proj ? { project_id: proj } : {};
    return await readJson<any[]>(await client.v1.dashboards.$get({ query }, { headers }));
  } catch {
    return [];
  }
}

export async function getServerDashboard(id: string, proj?: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    const query = proj ? { project_id: proj } : {};
    return await readJson<any>(await client.v1.dashboards[":id"].$get({ param: { id }, query }, { headers }));
  } catch {
    return null;
  }
}

export async function getServerPublicDashboard(token: string) {
  try {
    return await readJson<any>(await client.v1.dashboards.public[":token"].$get({ param: { token } }));
  } catch {
    return null;
  }
}

export async function getServerVariables(proj: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.projects[":proj"].variables.$get({ param: { proj } }, { headers }));
  } catch {
    return [];
  }
}

export async function getServerProjectState(proj: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any>(await client.v1.projects[":proj"].state.$get({ param: { proj } }, { headers }));
  } catch {
    return null;
  }
}

export async function getServerTokens(proj: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.projects[":proj"].tokens.$get({ param: { proj } }, { headers }));
  } catch {
    return [];
  }
}

export async function getServerProjectUsers(proj: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.projects[":proj"].users.$get({ param: { proj } }, { headers }));
  } catch {
    return [];
  }
}

export async function getServerAutomations(proj: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.projects[":proj"].automations.$get({ param: { proj } }, { headers }));
  } catch {
    return [];
  }
}

export async function getServerIntegrations(proj: string, request?: Request | string | null) {
  try {
    const headers = getAuthHeaders(request);
    return await readJson<any[]>(await client.v1.admin.projects[":proj"].integrations.$get({ param: { proj } }, { headers }));
  } catch {
    return [];
  }
}
