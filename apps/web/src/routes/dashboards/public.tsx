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
import { getCurrentUser, getPublicDashboard, signIn, signOut } from "@/lib/api-client";
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
      await signIn({ username, password });
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
    projectId: dashboard?.projectId || "",
    dashboardId: dashboard?.id || "",
    enabled: statusCode === "OK" && Boolean(dashboard?.id),
    onMessage: handleRealtimeMessage,
  });

  const handleControl = useCallback(async (key: string, val: any) => {
    if (!dashboard?.projectId) {
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

    await sendRealtimeControl(key, val);
  }, [dashboard?.projectId, sendRealtimeControl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-xs font-mono text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (statusCode === "PAUSED") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-center space-y-2 max-w-sm">
          <PauseCircle className="h-6 w-6 text-muted-foreground mx-auto" />
          <h2 className="text-xs font-medium text-foreground">Access paused</h2>
          <p className="text-[11px] text-muted-foreground">
            {errorMsg || "This dashboard is temporarily paused by the administrator."}
          </p>
        </div>
      </div>
    );
  }

  if (statusCode === "LOGIN_REQUIRED") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-xs border border-border bg-card p-5 space-y-4 shadow-sm rounded-sm">
          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-card-foreground">Sign in</h2>
            <p className="text-[11px] text-muted-foreground">
              Sign in with your configured credentials to view this dashboard.
            </p>
          </div>

          {loginError && (
            <div className="border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-1.5 rounded-sm">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Username or Email
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="h-8 text-xs bg-background border-input rounded-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-8 text-xs bg-background border-input rounded-none"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={loggingIn || !username || !password}
              className="w-full h-8 text-xs rounded-none"
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
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-center space-y-2 max-w-sm">
          <Lock className="h-6 w-6 text-muted-foreground mx-auto" />
          <h2 className="text-xs font-medium text-foreground">
            {statusCode === "NOT_FOUND" ? "Dashboard not found" : "Access denied"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {errorMsg || "You do not have permission to view this dashboard."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              signOut();
              setStatusCode("LOGIN_REQUIRED");
            }}
            className="h-7 text-xs rounded-none border-border mt-2"
          >
            Sign in with another account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh min-h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground flex flex-col select-none">
      {/* Clean Minimal Header with Theme Toggle */}
      <header className="h-10 shrink-0 border-b border-border bg-card/80 backdrop-blur px-4 flex items-center justify-between">
        <h1 className="text-xs font-medium text-foreground truncate">
          {dashboard?.name || "Dashboard"}
        </h1>

        <div className="flex items-center gap-1">
          {isAuthenticated && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-none"
              title="Log out"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Logout
            </Button>
          )}
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={toggleFullscreen}
            className="h-7 w-7 rounded-none text-muted-foreground hover:text-foreground hover:bg-accent"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </header>

      {/* Grid Canvas */}
      <main className="flex-none p-1 sm:p-4 w-full">
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
