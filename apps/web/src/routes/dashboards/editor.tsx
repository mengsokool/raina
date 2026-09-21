import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLoaderData, redirect } from "react-router";
import { nanoid } from "nanoid";
import { Monitor, Smartphone, RotateCcw, X } from "lucide-react";
import { DashboardGrid } from "./grid/DashboardGrid";
import { WidgetPalette } from "./components/WidgetPalette";
import { WidgetConfigPanel } from "./components/WidgetConfigPanel";
import { Layout as LayoutType, WidgetInstance, Dashboard } from "@/types";
import { widgets } from "./widgets";
import { effectiveMobileLayout } from "./grid/mobile-layout";
import { TopbarActions } from "@/components/TopbarActions";
import { useShell } from "@/components/ShellContext";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getDashboard, updateDashboard, listVariables } from "@/lib/api-client";
import { getServerDashboard, getServerVariables } from "@/lib/server-loaders";

export function meta({ data }: { data?: { initialDashboard?: any } }) {
  const name = data?.initialDashboard?.name;
  return [
    { title: name ? `Edit ${name} — raina IoT` : "Edit Dashboard — raina" },
    { name: "description", content: "Visual grid layout and widget arrangement editor" },
  ];
}

export async function loader({ params, request }: { params: { proj: string; id: string }; request: Request }) {
  const { proj, id } = params;
  const [initialDashboard, initialVariables] = await Promise.all([
    getServerDashboard(id, proj, request),
    getServerVariables(proj, request),
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
    initialVariables,
  };
}

export default function DashboardEditorPage() {
  const { proj, id, initialDashboard, initialVariables } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { setSidebarCollapsed, isClient, setBreadcrumbTitle } = useShell();

  useEffect(() => {
    if (isClient) {
      navigate(`/p/${proj}/dashboards/${id}`, { replace: true });
    }
  }, [isClient, proj, id, navigate]);

  // Auto-collapse sidebar when entering editor for wider workspace
  useEffect(() => {
    setSidebarCollapsed(true);
    return () => {
      setSidebarCollapsed(false);
    };
  }, [setSidebarCollapsed]);

  const [dashboard, setDashboard] = useState<Dashboard | null>(initialDashboard as any);

  useEffect(() => {
    if (dashboard?.name) {
      setBreadcrumbTitle(dashboard.name);
    }
  }, [dashboard?.name, setBreadcrumbTitle]);

  const [layout, setLayout] = useState<LayoutType>(() => {
    if (!initialDashboard) return { grid: { columns: 24 }, items: [] };
    const rawLayout = initialDashboard.layout || {};
    const rawItems = Array.isArray(initialDashboard.widgets) && initialDashboard.widgets.length > 0
      ? initialDashboard.widgets
      : rawLayout.items || [];
    return {
      grid: { columns: 24 },
      items: rawItems as any,
      mobile: rawLayout.mobile ?? null,
    };
  });

  const [variables, setVariables] = useState<{ key: string; unit?: string }[]>(() => {
    return (initialVariables || []).map((v: any) => ({ key: v.key, unit: v.unit || undefined }));
  });

  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [loading, setLoading] = useState(!initialDashboard);

  const selectedWidget = useMemo(() => {
    if (!selectedWidgetId) return null;
    return layout.items.find((it) => it.id === selectedWidgetId) || null;
  }, [layout.items, selectedWidgetId]);

  // Intercept accidental browser reload/close when there are unsaved changes
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Close widget config on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedWidgetId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleExit = () => {
    if (dirty) {
      setConfirmExitOpen(true);
    } else {
      navigate(`/p/${proj}/dashboards/${id}`);
    }
  };

  const activeLayout = useMemo<LayoutType>(() => {
    return viewMode === "mobile" ? effectiveMobileLayout(layout) : layout;
  }, [viewMode, layout]);

  useEffect(() => {
    if (initialDashboard) return;

    async function init() {
      try {
        const [dashData, varData] = await Promise.all([
          getDashboard(id, proj).catch(() => null),
          listVariables(proj).catch(() => []),
        ]);

        if (dashData) {
          if ((dashData.projectId || (dashData as any).project_id) && (dashData.projectId || (dashData as any).project_id) !== proj) {
            navigate(`/p/${proj}/dashboards`, { replace: true });
            return;
          }
          setDashboard(dashData as any);
          const rawLayout = dashData.layout || {};
          const rawItems = Array.isArray(dashData.widgets) && dashData.widgets.length > 0
            ? dashData.widgets
            : rawLayout.items || [];
          setLayout({
            grid: { columns: 24 },
            items: rawItems as any,
            mobile: rawLayout.mobile ?? null,
          });
        }

        if (varData) {
          setVariables(varData.map((v: any) => ({ key: v.key, unit: v.unit || undefined })));
        }
      } catch (err) {
        console.error("Failed to load dashboard editor", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [proj, id, initialDashboard, navigate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payloadLayout: LayoutType = {
        grid: { columns: 24 },
        items: layout.items,
        mobile: layout.mobile ?? null,
      };

      await updateDashboard(id, {
        layout: payloadLayout as any,
        widgets: layout.items as any,
        mobile: layout.mobile ?? null,
      });
      setDirty(false);
    } catch (e) {
      console.error("Failed to save layout", e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddWidget = (manifestId: string) => {
    const manifest = widgets.manifestFor(manifestId as any);
    if (!manifest) return;

    let maxY = 0;
    for (const it of layout.items) {
      const b = (it.y || 0) + (it.h || 0);
      if (b > maxY) maxY = b;
    }

    const defaultW = manifest.defaultSize?.w || 6;
    const defaultH = manifest.defaultSize?.h || 4;

    const newWidget: WidgetInstance = {
      id: nanoid(8),
      type: manifestId,
      props: { ...manifest.defaultProps },
      x: 0,
      y: maxY,
      w: defaultW,
      h: defaultH,
    };

    setLayout((prev) => ({
      ...prev,
      items: [...prev.items, newWidget],
    }));

    setSelectedWidgetId(newWidget.id);
    setDirty(true);
    setPaletteOpen(false);
  };

  const handleRemoveWidget = (widgetId: string) => {
    setLayout((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== widgetId),
      mobile: prev.mobile
        ? { items: (prev.mobile.items || []).filter((it) => it.id !== widgetId) }
        : prev.mobile,
    }));

    if (selectedWidgetId === widgetId) {
      setSelectedWidgetId(null);
    }
    setDirty(true);
  };

  const handleDuplicateWidget = (widgetId: string) => {
    const target = layout.items.find((it) => it.id === widgetId);
    if (!target) return;

    const newWidget: WidgetInstance = {
      ...target,
      id: nanoid(8),
      props: { ...target.props, title: `${(target.props as any)?.title || "Widget"} (Copy)` },
      x: target.x,
      y: target.y + target.h,
      w: target.w,
      h: target.h,
    };

    setLayout((prev) => ({
      ...prev,
      items: [...prev.items, newWidget],
    }));

    setSelectedWidgetId(newWidget.id);
    setDirty(true);
  };

  const handleUpdateWidget = (updated: WidgetInstance) => {
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === updated.id ? updated : it)),
    }));
    setDirty(true);
  };

  const handleLayoutChange = (newLayout: LayoutType) => {
    setLayout(newLayout);
    setDirty(true);
  };

  const handleSetViewMode = (mode: "desktop" | "mobile") => {
    setViewMode(mode);
    setSelectedWidgetId(null);
  };

  const handleResetMobileLayout = () => {
    setLayout((prev) => ({ ...prev, mobile: null }));
    setDirty(true);
  };

  return (
    <>
      <TopbarActions>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-md p-0.5 bg-muted">
            <button
              type="button"
              onClick={() => handleSetViewMode("desktop")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "desktop"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="size-3.5" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode("mobile")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "mobile"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="size-3.5" />
              <span>Mobile</span>
            </button>
          </div>

          {/* Reset Mobile Layout button */}
          {viewMode === "mobile" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetMobileLayout}
              title="Reset mobile order to match desktop positions"
            >
              <RotateCcw className="size-3.5" />
              <span>Reset Order</span>
            </Button>
          )}

          {/* Add Widget Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPaletteOpen(true)}
          >
            <span>+ Add Widget</span>
          </Button>

          {/* Save Button */}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
          </Button>

          {/* Exit / Done Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleExit}
            title="Done & Close Editor"
          >
            <X className="size-4" />
          </Button>
        </div>
      </TopbarActions>

      <div className="relative flex-1 flex overflow-hidden min-h-full">
        {/* Canvas Area */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 canvas-dots flex justify-center"
          onClick={() => setSelectedWidgetId(null)}
        >
          {loading ? (
            <div className="text-xs font-mono text-muted-foreground py-16">
              Loading editor...
            </div>
          ) : (
            <div
              className={`w-full transition-all duration-200 ${
                viewMode === "mobile"
                  ? "max-w-md bg-muted/60 p-3 rounded-2xl border-4 border-border shadow-xl my-4 self-start"
                  : "max-w-full"
              }`}
            >
              {viewMode === "mobile" && (
                <div className="text-center pb-3 pt-1 border-b border-border mb-3">
                  <span className="text-xs font-mono font-medium tracking-wider text-muted-foreground uppercase">
                    Mobile Phone Viewport (Single Column)
                  </span>
                </div>
              )}

              <DashboardGrid
                key={viewMode}
                layout={activeLayout}
                isEditing={true}
                selectedId={selectedWidgetId}
                onSelectWidget={(item) => setSelectedWidgetId(item ? item.id : null)}
                onLayoutChange={handleLayoutChange}
                onRemoveWidget={handleRemoveWidget}
              />
            </div>
          )}
        </div>

        {/* Right Slide-in Config Panel */}
        {selectedWidget && (
          <aside className="w-80 border-l border-border bg-card flex flex-col z-30 shrink-0 shadow-lg">
            <WidgetConfigPanel
              item={selectedWidget}
              availableVariables={variables}
              onClose={() => setSelectedWidgetId(null)}
              onUpdate={handleUpdateWidget}
              onDuplicate={handleDuplicateWidget}
              onRemove={handleRemoveWidget}
            />
          </aside>
        )}

        {/* Floating Add Widget Palette Drawer/Modal */}
        <WidgetPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onAdd={handleAddWidget}
        />

        {/* Confirm Exit with unsaved changes dialog */}
        <AlertDialog open={confirmExitOpen} onOpenChange={setConfirmExitOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Unsaved Changes
              </AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes in your layout. If you leave now, your modifications will
                be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">Stay in Editor</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                size="sm"
                onClick={() => navigate(`/p/${proj}/dashboards/${id}`)}
              >
                Discard & Exit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
