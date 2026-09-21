import type { Route } from "./+types/api-proxy";
import { clearSessionCookie, getBffSessionToken } from "@/lib/bff-session.server";

const targetBase = process.env.INTERNAL_API_URL || "http://127.0.0.1:3001";

async function forward(request: Request, params: Record<string, string | undefined>) {
  const url = new URL(request.url);
  const subPath = params["*"] || "";
  const targetUrl = new URL(`/v1/${subPath}${url.search}`, targetBase);

  const headers = new Headers(request.headers);
  headers.delete("host");
  const token = getBffSessionToken(headers.get("cookie"));
  headers.delete("cookie");
  if (token) headers.set("x-session-token", token);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl.toString(), init);

  // React Router's response handling is allowed to normalize headers. Rebuild
  // the response and append each cookie separately so an upstream session is
  // never lost on its way back through this same-origin proxy.
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("set-cookie");
  if (subPath === "auth/sign-out") responseHeaders.append("Set-Cookie", clearSessionCookie(request));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const loader = ({ request, params }: Route.LoaderArgs) => forward(request, params);
export const action = ({ request, params }: Route.ActionArgs) => forward(request, params);
