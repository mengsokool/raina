import { clearSessionCookie, sessionCookie } from "@/lib/bff-session.server";
import { signOut } from "@/lib/api-client";

const apiBase = process.env.INTERNAL_API_URL || "http://127.0.0.1:3001";

export async function action({ request }: { request: Request }) {
  if (request.method === "DELETE") {
    return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(request) } });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.password !== "string") return Response.json({ error: "Invalid sign-in request" }, { status: 400 });
  const endpoint = body.bootstrap ? "/v1/auth/bootstrap" : "/v1/auth/sign-in";
  const payload = { ...body };
  delete payload.bootstrap;
  const upstream = await fetch(new URL(endpoint, apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await upstream.json().catch(() => ({})) as { token?: string; user?: unknown; error?: string };
  if (!upstream.ok || !data.token || !/^[a-f0-9]{64}$/i.test(data.token)) {
    return Response.json({ error: data.error || "Sign in failed" }, { status: upstream.status || 500 });
  }
  return Response.json({ user: data.user }, { headers: { "Set-Cookie": sessionCookie(data.token, request) } });
}

/** Clears browser-only state after the BFF has invalidated its session. */
export async function clearClientSessionAndRedirect(redirectTo = "/login") {
  try {
    await signOut();
  } catch (error) {
    console.error("BFF sign out error (proceeding with local purge)", error);
  }
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("raina_token");
    sessionStorage.clear();
  } catch {}
  window.location.replace(redirectTo);
}
