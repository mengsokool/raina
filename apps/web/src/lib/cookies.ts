export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export const COOKIE_KEYS = {
  DASHBOARD_VIEW_MODE: "raina_dashboard_view_mode",
  CHART_WINDOW: "raina_chart_window",
  SIDEBAR_COLLAPSED: "raina_sidebar_collapsed",
} as const;

