import { signOut } from "@/lib/api-client";

/** Clears browser-only legacy state after the backend has invalidated its session. */
export async function clearClientSessionAndRedirect(redirectTo = "/login") {
  try {
    await signOut();
  } catch (error) {
    console.error("Backend sign out error (proceeding with local purge)", error);
  }

  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem("raina_token");
    sessionStorage.clear();
  } catch {}

  const host = window.location.hostname;
  const domainParts = host.split(".");
  for (const cookieName of ["raina_session", "raina_token"]) {
    for (const path of ["/", "/p", "/settings", "/login"]) {
      document.cookie = `${cookieName}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax`;
      document.cookie = `${cookieName}=; path=${path}; domain=${host}; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax`;
      if (domainParts.length > 1) {
        document.cookie = `${cookieName}=; path=${path}; domain=.${host}; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax`;
      }
    }
  }
  window.location.replace(redirectTo);
}
