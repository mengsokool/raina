import { describe, it, expect } from "vitest";
import {
  clearSessionCookie,
  getBffSessionToken,
  getSessionCookieName,
  isSecureRequest,
  sessionCookie,
} from "@/lib/bff-session.server";

describe("BFF Session Cookie Utilities", () => {
  const dummyToken = "a".repeat(64);

  it("identifies secure vs insecure requests correctly", () => {
    const httpReq = new Request("http://localhost:3000/auth/session");
    expect(isSecureRequest(httpReq)).toBe(false);

    const httpsReq = new Request("https://localhost:3000/auth/session");
    expect(isSecureRequest(httpsReq)).toBe(true);

    const forwardedHttps = new Request("http://localhost:3000/auth/session", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(isSecureRequest(forwardedHttps)).toBe(true);

    const forwardedMultiple = new Request("http://localhost:3000/auth/session", {
      headers: { "x-forwarded-proto": "https, http" },
    });
    expect(isSecureRequest(forwardedMultiple)).toBe(true);
  });

  it("uses raina_session without Secure on plain HTTP to prevent browser rejection", () => {
    const httpReq = new Request("http://localhost:3000/auth/session");
    expect(getSessionCookieName(httpReq)).toBe("raina_session");

    const cookie = sessionCookie(dummyToken, httpReq);
    expect(cookie).toContain("raina_session=" + dummyToken);
    expect(cookie).not.toContain("__Host-");
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("uses __Host-raina_session with Secure on HTTPS", () => {
    const httpsReq = new Request("https://example.com/auth/session");
    expect(getSessionCookieName(httpsReq)).toBe("__Host-raina_session");

    const cookie = sessionCookie(dummyToken, httpsReq);
    expect(cookie).toContain("__Host-raina_session=" + dummyToken);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
  });

  it("parses session token from both __Host-raina_session and raina_session", () => {
    expect(getBffSessionToken(`__Host-raina_session=${dummyToken}`)).toBe(dummyToken);
    expect(getBffSessionToken(`raina_session=${dummyToken}`)).toBe(dummyToken);
    expect(getBffSessionToken(`other_cookie=123; raina_session=${dummyToken}`)).toBe(dummyToken);
    expect(getBffSessionToken(`other_cookie=123; __Host-raina_session=${dummyToken}`)).toBe(dummyToken);
    expect(getBffSessionToken("raina_session=invalid")).toBeNull();
    expect(getBffSessionToken(null)).toBeNull();
  });

  it("clears session cookie appropriately for HTTP and HTTPS", () => {
    const httpReq = new Request("http://localhost:3000/auth/session");
    const httpClear = clearSessionCookie(httpReq);
    expect(httpClear).toContain("raina_session=");
    expect(httpClear).not.toContain("__Host-");
    expect(httpClear).not.toContain("Secure");
    expect(httpClear).toContain("Max-Age=0");

    const httpsReq = new Request("https://example.com/auth/session");
    const httpsClear = clearSessionCookie(httpsReq);
    expect(httpsClear).toContain("__Host-raina_session=");
    expect(httpsClear).toContain("Secure");
    expect(httpsClear).toContain("Max-Age=0");
  });
});
