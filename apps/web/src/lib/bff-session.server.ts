const SESSION_COOKIE = "__Host-raina_session";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function isSecureRequest(request: Request): boolean {
  // Cloud Run terminates TLS before the container and retains the original
  // scheme here. `__Host-` cookies are invalid unless Secure is present.
  return request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https"
    || new URL(request.url).protocol === "https:";
}

export function getBffSessionToken(cookieHeader: string | null): string | null {
  const token = cookieHeader?.match(/(?:^|;\s*)__Host-raina_session=([^;]+)/i)?.[1];
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

export function sessionCookie(token: string, request: Request, maxAge = 30 * 24 * 60 * 60): string {
  const secure = isSecureRequest(request);
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = isSecureRequest(request);
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
