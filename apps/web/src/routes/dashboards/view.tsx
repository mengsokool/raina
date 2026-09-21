import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useLoaderData, redirect } from "react-router";
import { Share2, Pencil, Radio } from "lucide-react";
import { DashboardGrid } from "./grid/DashboardGrid";
import { effectiveMobileLayout } from "./grid/mobile-layout";
import { Layout as LayoutType, Dashboard } from "@/types";
import { useIsPhone } from "@/lib/useViewport";
import { TopbarActions } from "@/components/TopbarActions";
import { getDashboard, getProjectState } from "@/lib/api-client";
import { getServerDashboard, getServerProjectState } from "@/lib/server-loaders";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { useShell } from "@/components/ShellContext";
import { Button } from "@/components/ui/button";
import { ShareDashboardDialog } from "./components/ShareDashboardDialog";

export function meta({ data }: { data?: { initialDashboard?: any } }) {
  const name = data?.initialDashboard?.name;
  return [
    { title: name ? `${name} — raina IoT` : "Dashboard — raina" },
    { name: "description", content: data?.initialDashboard?.description || "Live IoT Telemetry Dashboard" },
  ];
}

export async function loader({ params, request }: { params: { proj: string; id: string }; request: Request }) {
  const { proj, id } = params;
  const [initialDashboard, initialState] = await Promise.all([
    getServerDashboard(id, proj, request),
    getServerProjectState(proj, request),
  ]);

  if (
    !initialDashboard ||
    ((initialDashboard.projectId || initialDashboard.project_id) &&
      (initialDashboard.projectId || initialDashboard.project_id) !== proj)
  ) {
    throw redirect(`/p/${proj}/dashboards`);
  }

  return {
    proj,
    id,
    initialDashboard,
    initialState,
  };
}

export default function DashboardLiveViewPage() {
  const { proj, id, initialDashboard, initialState } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { isClient, currentUser, setBreadcrumbTitle } = useShell();
  const isPhone = useIsPhone();

  const [dashboard, setDashboard] = useState<Dashboard | null>(initialDashboard as any);

  useEffect(() => {
    if (dashboard?.name) {
      setBreadcrumbTitle(dashboard.name);
    }
  }, [dashboard?.name, setBreadcrumbTitle]);

  const [layout, setLayout] = useState<LayoutType>(() => {
    if (!initialDashboard) return { items: [] };
    const rawLayout = initialDashboard.layout || {};
    const rawItems = Array.isArray(initialDashboard.widgets) && initialDashboard.widgets.length > 0
      ? initialDashboard.widgets
      : rawLayout.items || [];
    return {
      grid: { columns: 24 },
      items: rawItems,
      mobile: rawLayout.mobile ?? null,
    };
  });

  const [variables, setVariables] = useState<Record<string, unknown>>(() => {
    if (!initialState?.variables) return {};
    const varValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(initialState.variables)) {
      varValues[k] = (v as any)?.value !== undefined ? (v as any).value : v;
    }
    return varValues;
  });

  const [seriesMap, setSeriesMap] = useState<Record<string, { t: number[]; v: number[] }>>(() => {
    return initialState?.series || {};
  });

  const [loading, setLoading] = useState(!initialDashboard);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const effectiveLayout = useMemo<LayoutType>(() => {
    return isPhone ? effectiveMobileLayout(layout) : layout;
  }, [isPhone, layout]);

  // If initial data wasn't provided by server, fetch it on mount
  useEffect(() => {
    if (initialDashboard) return;

    async function init() {
      try {
        setAccessError(null);
        let dashData = null;
        try {
          dashData = await getDashboard(id, proj);
        } catch (err: any) {
          setAccessError(err.message || "Access denied: You do not have permission to view this dashboard.");
        }

        const stateData = await getProjectState(proj).catch(() => null);

        if (dashData) {
          if ((dashData.projectId || (dashData as any).project_id) && (dashData.projectId || (dashData as any).project_id) !== proj) {
            navigate(`/p/${proj}/dashboards`, { replace: true });
            return;
          }
          setDashboard(dashData as any);
          const rawLayout = dashData.layout || {};
          const rawItems = Array.isArray((dashData as any).widgets) && (dashData as any).widgets.length > 0
            ? (dashData as any).widgets
            : rawLayout.items || [];
          setLayout({
            grid: { columns: 24 },
            items: rawItems,
            mobile: rawLayout.mobile ?? null,
          });
        }

        if (stateData) {
          const varValues: Record<string, unknown> = {};
          if (stateData.variables) {
            for (const [k, v] of Object.entries(stateData.variables)) {
              varValues[k] = (v as any)?.value !== undefined ? (v as any).value : v;
            }
          }
          setVariables(varValues);
          if (stateData.series) {
            setSeriesMap(stateData.series as any);
          }
        }
      } catch (err: any) {
        console.error("DashboardLiveView: error fetching initial data", err);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [id, proj, initialDashboard, navigate]);

  // Handle Real-Time Updates via Global Realtime Hook (SSE + WebSocket)
  const handleRealtimeMessage = useCallback((msg: any) => {
    if (msg.type === "telemetry" || msg.type === "update" || msg.type === "control") {
      const { variable, value, timestamp } = msg;
      if (variable) {
        setVariables((prev) => ({ ...prev, [variable]: value }));

        const num = Number(value);
        if (!isNaN(num) && isFinite(num)) {
          const t = timestamp
            ? timestamp > 1e11
              ? timestamp
              : timestamp * 1000
            : Date.now();
          setSeriesMap((prev) => {
            const existing = prev[variable] || { t: [], v: [] };
            const newT = [...existing.t, t].slice(-100);
            const newV = [...existing.v, num].slice(-100);
            return {
              ...prev,
              [variable]: { t: newT, v: newV },
            };
          });
        }
      }
    } else if (msg.type === "snapshot") {
      if (msg.variables) {
        setVariables((prev) => ({ ...prev, ...msg.variables }));
      }
      if (msg.series) {
        setSeriesMap((prev) => ({ ...prev, ...msg.series }));
      }
    }
  }, []);

  const { sendControl: sendRealtimeControl } = useDashboardRealtime({
    projectId: proj,
    dashboardId: id,
    onMessage: handleRealtimeMessage,
  });

  const handleControl = async (key: string, val: any) => {
    setVariables((prev) => ({ ...prev, [key]: val }));

    const num = Number(val);
    if (!isNaN(num) && isFinite(num)) {
      setSeriesMap((prev) => {
        const existing = prev[key] || { t: [], v: [] };
        const newT = [...existing.t, Date.now()].slice(-100);
        const newV = [...existing.v, num].slice(-100);
        return {
          ...prev,
          [key]: { t: newT, v: newV },
        };
      });
    }

    try {
      await sendRealtimeControl(key, val);
    } catch (e) {
      console.error("Failed to send control command", e);
    }
  };

  return (
    <>
      <TopbarActions>
        <div className="flex items-center gap-2">
          {!isClient && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="size-3.5" />
              <span>Share</span>
            </Button>
          )}

          {!isClient && (
            <Link to={`/p/${proj}/dashboards/${id}/edit`}>
              <Button
                type="button"
                size="sm"
              >
                <Pencil className="size-3.5" />
                <span>Edit</span>
              </Button>
            </Link>
          )}
        </div>
      </TopbarActions>

      <div className="min-h-full p-1 sm:p-4 md:p-6 w-full max-w-full overflow-x-hidden">
        {loading ? (
          <div className="text-xs font-mono text-muted-foreground py-16 text-center">
            Loading dashboard...
          </div>
        ) : accessError ? (
          <div className="py-20 text-center max-w-md mx-auto">
            <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
              <Radio className="size-6" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Access Restricted
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {accessError}
            </p>
            {isClient && currentUser?.accessibleDashboards?.[0] && (
              <Link
                to={`/p/${currentUser.accessibleDashboards[0].projectId}/dashboards/${currentUser.accessibleDashboards[0].id}`}
              >
                <Button className="mt-6">
                  Go to your authorized dashboard
                </Button>
              </Link>
            )}
          </div>
        ) : (
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
        )}
      </div>

      {!isClient && (
        <ShareDashboardDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          dashboardId={id}
          dashboardTitle={dashboard?.name || "Dashboard"}
          initialVisibility={dashboard?.visibility || "private"}
          initialShareToken={dashboard?.share_token || (dashboard as any)?.publicToken || null}
          projectId={proj}
          onUpdated={(updated) => {
            setDashboard((prev: any) =>
              prev
                ? {
                    ...prev,
                    visibility: updated.visibility,
                    share_token: updated.shareToken,
                    publicToken: updated.shareToken,
                  }
                : prev
            );
          }}
        />
      )}
    </>
  );
}
