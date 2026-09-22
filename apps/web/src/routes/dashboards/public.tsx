import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLoaderData } from "react-router";
import { DashboardGrid } from "./grid/DashboardGrid";
import { Layout as LayoutType } from "@/types";
import { effectiveMobileLayout } from "./grid/mobile-layout";
import { useIsPhone } from "@/lib/useViewport";
import { Maximize2, Minimize2, Lock, PauseCircle, AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser, getPublicDashboard, signOut } from "@/lib/api-client";
import { getServerPublicDashboard } from "@/lib/server-loaders";
import { HttpError } from "@/lib/http";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";

export function meta({ data }: { data?: { initialDashboard?: any } }) {
  const name = data?.initialDashboard?.name;
  return [
    { title: name ? `${name} — raina IoT` : "Public Dashboard — raina" },
    { name: "description", content: data?.initialDashboard?.description || "Live IoT Farm & Telemetry Dashboard" },
  ];
}

export async function loader({ params }: { params: { token: string } }) {
  const token = params.token;
  let initialDashboard = null;
  try {
    initialDashboard = await getServerPublicDashboard(token);
  } catch {}

  return { token, initialDashboard };
}

export default function PublicDashboardRoute() {
  const { token, initialDashboard } = useLoaderData<typeof loader>();
  const isPhone = useIsPhone();
  const [dashboard, setDashboard] = useState<any | null>(initialDashboard);
  const [layout, setLayout] = useState<LayoutType>(() => {
    const rawLayout: any = initialDashboard?.layout || {};
    const rawItems = (initialDashboard as any)?.widgets || rawLayout.items || [];
    return {
      grid: { columns: 24 },
      items: rawItems,
      mobile: rawLayout.mobile ?? null,
    };
  });
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [seriesMap, setSeriesMap] = useState<Record<string, { t: number[]; v: number[] }>>({});
  const [loading, setLoading] = useState(!initialDashboard);
  const [statusCode, setStatusCode] = useState<"OK" | "LOGIN_REQUIRED" | "PAUSED" | "FORBIDDEN" | "NOT_FOUND">("OK");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const effectiveLayout = useMemo<LayoutType>(() => {
    return isPhone ? effectiveMobileLayout(layout) : layout;
  }, [isPhone, layout]);

  // Login form state for Restricted access
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getPublicDashboard(token);
      setDashboard(data as any);
      const rawLayout = data.layout || {};
      const rawItems = (data as any).widgets || rawLayout.items || [];
      setLayout({
        grid: { columns: 24 },
        items: rawItems,
        mobile: rawLayout.mobile ?? null,
      });
      setStatusCode("OK");
    } catch (err: any) {
      if (err instanceof HttpError) {
        if (err.status === 401) {
          setStatusCode("LOGIN_REQUIRED");
          setErrorMsg(err.message || "Sign in required to view this dashboard.");
        } else if (err.status === 403) {
          if (err.message.includes("paused")) {
            setStatusCode("PAUSED");
          } else {
            setStatusCode("FORBIDDEN");
          }
          setErrorMsg(err.message);
        } else if (err.status === 404) {
          setStatusCode("NOT_FOUND");
          setErrorMsg("Dashboard not found or link has expired.");
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg("Failed to connect to dashboard.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    getCurrentUser()
      .then(() => setIsAuthenticated(true))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoggingIn(true);
    setLoginError(null);
    try {
      const response = await fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invalid username or password");
      setIsAuthenticated(true);
      await fetchDashboardData();
    } catch (err: any) {
      setLoginError(err instanceof HttpError ? err.message : "Invalid username or password");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      setIsAuthenticated(false);
      setStatusCode("LOGIN_REQUIRED");
      setDashboard(null);
    }
  };

  const handleRealtimeMessage = useCallback((data: any) => {
    if (data.type === "snapshot") {
      if (data.variables) setVariables((prev) => ({ ...prev, ...data.variables }));
      if (data.series) setSeriesMap((prev) => ({ ...prev, ...data.series }));
      return;
    }

    if (!(["telemetry", "update", "control"] as const).includes(data.type) || !data.variable) return;

    setVariables((prev) => ({ ...prev, [data.variable]: data.value }));
    const num = Number(data.value);
    if (!Number.isFinite(num)) return;

    const timestamp = data.timestamp
      ? data.timestamp > 1e11 ? data.timestamp : data.timestamp * 1000
      : Date.now();
    setSeriesMap((prev) => {
      const existing = prev[data.variable] || { t: [], v: [] };
      return {
        ...prev,
        [data.variable]: {
          t: [...existing.t, timestamp].slice(-100),
          v: [...existing.v, num].slice(-100),
        },
      };
    });
  }, []);

  const { sendControl: sendRealtimeControl } = useDashboardRealtime({
    projectId: dashboard?.projectId || dashboard?.project_id || "",
    dashboardId: dashboard?.id || "",
    enabled: statusCode === "OK" && Boolean(dashboard?.id),
    onMessage: handleRealtimeMessage,
  });

  const handleControl = useCallback(async (key: string, val: any) => {
    const activeProjectId = dashboard?.projectId || dashboard?.project_id;
    if (!activeProjectId) {
      throw new Error("Dashboard project is unavailable");
    }

    // Keep the shared view optimistic, like the authenticated dashboard view.
    setVariables((prev) => ({ ...prev, [key]: val }));

    const num = Number(val);
    if (!isNaN(num) && isFinite(num)) {
      setSeriesMap((prev) => {
        const existing = prev[key] || { t: [], v: [] };
        return {
          ...prev,
          [key]: {
            t: [...existing.t, Date.now()].slice(-100),
            v: [...existing.v, num].slice(-100),
          },
        };
      });
    }

    try {
      await sendRealtimeControl(key, val);
    } catch (err) {
      console.error("Failed to send control command", err);
    }
  }, [dashboard?.projectId, dashboard?.project_id, sendRealtimeControl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 text-foreground flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <span className="size-2 animate-pulse bg-primary" aria-hidden="true" />
          Loading dashboard
        </div>
      </div>
    );
  }

  if (statusCode === "PAUSED") {
    return (
      <div className="min-h-screen bg-muted/30 text-foreground flex items-center justify-center p-5">
        <div className="w-full max-w-sm border-l-2 border-l-primary bg-card p-6 shadow-sm">
          <PauseCircle className="size-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-5 text-lg font-semibold tracking-tight">This dashboard is paused</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {errorMsg || "This shared view is temporarily unavailable."}
          </p>
        </div>
      </div>
    );
  }

  if (statusCode === "LOGIN_REQUIRED") {
    return (
      <div className="min-h-screen bg-muted/30 text-foreground flex items-center justify-center p-5">
        <div className="w-full max-w-sm border border-border bg-card p-6 shadow-sm">
          <img src="/raina-mark-128.png" alt="Raina" className="size-7" />
          <div className="mt-6">
            <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">Sign in to view</h1>
          </div>

          {loginError && (
            <div className="border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-1.5 rounded-sm">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4 text-sm">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Username or Email
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              size="default"
              disabled={loggingIn || !username || !password}
              className="w-full"
            >
              {loggingIn ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (statusCode === "FORBIDDEN" || statusCode === "NOT_FOUND") {
    return (
      <div className="min-h-screen bg-muted/30 text-foreground flex items-center justify-center p-5">
        <div className="w-full max-w-sm border-l-2 border-l-muted-foreground/40 bg-card p-6 shadow-sm">
          <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-5 text-lg font-semibold tracking-tight">
            {statusCode === "NOT_FOUND" ? "This link is unavailable" : "This view is unavailable"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {errorMsg || "You do not have access to this dashboard."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              signOut();
              setStatusCode("LOGIN_REQUIRED");
            }}
            className="mt-5"
          >
            Sign in with another account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-muted/30 text-foreground">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/80 bg-background/90 px-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/raina-mark-128.png" alt="Raina" className="size-5 shrink-0" />
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {dashboard?.name || "Dashboard"}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex size-7 items-center justify-center" role="status" aria-label="Live dashboard" title="Live dashboard">
            <span className="size-2 rounded-full bg-primary ring-4 ring-primary/15" aria-hidden="true" />
          </div>
          {isAuthenticated && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="size-3.5" />
            </Button>
          )}
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
        </div>
      </header>

      <main className="w-full p-2 sm:p-6">
        <DashboardGrid
          key={isPhone ? "mobile" : "desktop"}
          layout={effectiveLayout}
          isEditing={false}
          selectedId={null}
          onSelectWidget={() => {}}
          onLayoutChange={() => {}}
          onRemoveWidget={() => {}}
          variableValues={variables}
          seriesMap={seriesMap}
          onControl={handleControl}
        />
      </main>
    </div>
  );
}
