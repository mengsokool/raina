import type { Route } from "./+types/api-proxy";

const targetBase = process.env.INTERNAL_API_URL || "http://127.0.0.1:3001";
const WEB_SESSION_COOKIE = "__Host-raina_web_session";

function sessionCookieValue(cookie: string): string | null {
  const match = cookie.match(/(?:^|;\s*)raina_session=([^;]*)/i);
  return match?.[1] ?? null;
}

function fallbackSessionCookie(token: string, sourceCookie: string): string | null {
  // Raina sessions are generated as 32-byte hex tokens. Do not reflect an
  // arbitrary upstream value into a first-party cookie.
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const maxAge = sourceCookie.match(/(?:^|;\s*)Max-Age=(\d+)/i)?.[1] || String(30 * 24 * 60 * 60);
  return `${WEB_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

function withWebSession(cookieHeader: string | null): string | null {
  if (!cookieHeader) return cookieHeader;
  const fallback = cookieHeader.match(new RegExp(`(?:^|;\\s*)${WEB_SESSION_COOKIE}=([^;]+)`, "i"))?.[1];
  if (!fallback || !/^[a-f0-9]{64}$/i.test(fallback)) return cookieHeader;

  // Prefer the same-origin fallback over a stale parent-domain cookie.
  const withoutSessions = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^(?:raina_session|__Host-raina_web_session)=/i.test(part));
  return [...withoutSessions, `raina_session=${fallback}`].join("; ");
}

async function forward(request: Request, params: Record<string, string | undefined>) {
  const url = new URL(request.url);
  const subPath = params["*"] || "";
  const targetUrl = new URL(`/v1/${subPath}${url.search}`, targetBase);

  const headers = new Headers(request.headers);
  headers.delete("host");
  const cookieHeader = withWebSession(headers.get("cookie"));
  if (cookieHeader) headers.set("cookie", cookieHeader);

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
  const getSetCookie = upstream.headers.getSetCookie;
  const setCookies = typeof getSetCookie === "function"
    ? getSetCookie.call(upstream.headers)
    : [upstream.headers.get("set-cookie")].filter((value): value is string => Boolean(value));

  responseHeaders.delete("set-cookie");
  for (const cookie of setCookies) {
    responseHeaders.append("Set-Cookie", cookie);
    const token = sessionCookieValue(cookie);
    if (token) {
      const fallback = fallbackSessionCookie(token, cookie);
      if (fallback) responseHeaders.append("Set-Cookie", fallback);
    } else if (/^raina_session=;/i.test(cookie)) {
      responseHeaders.append(
        "Set-Cookie",
        `${WEB_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
      );
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const loader = ({ request, params }: Route.LoaderArgs) => forward(request, params);
export const action = ({ request, params }: Route.ActionArgs) => forward(request, params);
