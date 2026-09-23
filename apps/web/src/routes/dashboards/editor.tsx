import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLoaderData, redirect } from "react-router";
import { nanoid } from "nanoid";
import {
  Monitor,
  Smartphone,
  RotateCcw,
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Settings2,
  Trash2,
  Copy,
  ChevronLeft,
} from "lucide-react";
import { DashboardGrid } from "./grid/DashboardGrid";
import { WidgetPalette } from "./components/WidgetPalette";
import { WidgetConfigPanel } from "./components/WidgetConfigPanel";
import { Layout as LayoutType, WidgetInstance, Dashboard } from "@/types";
import { widgets } from "./widgets";
import { effectiveMobileLayout } from "./grid/mobile-layout";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TopbarActions } from "@/components/TopbarActions";
import { useShell } from "@/components/ShellContext";
import { useIsPhone } from "@/lib/useViewport";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
  const isPhone = useIsPhone();

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
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">(() => (isPhone ? "mobile" : "desktop"));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [loading, setLoading] = useState(!initialDashboard);

  // Sync viewMode if device is detected as phone
  useEffect(() => {
    if (isPhone) {
      setViewMode("mobile");
    }
  }, [isPhone]);

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

  // Keyboard shortcuts: Escape (deselect), Delete/Backspace (remove selected widget)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        setSelectedWidgetId(null);
        return;
      }

      if ((e.key === "Backspace" || e.key === "Delete") && selectedWidgetId && !isInput) {
        e.preventDefault();
        handleRemoveWidget(selectedWidgetId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedWidgetId]);

  const handleExit = () => {
    if (dirty) {
      setConfirmExitOpen(true);
    } else {
      navigate(`/p/${proj}/dashboards/${id}`);
    }
  };

  const activeLayout = useMemo<LayoutType>(() => {
    return viewMode === "mobile" || isPhone ? effectiveMobileLayout(layout) : layout;
  }, [viewMode, isPhone, layout]);

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
    if (viewMode === "mobile" || isPhone) {
      setLayout((prev) => ({
        ...prev,
        mobile: {
          items: newLayout.items.map((it) => ({
            id: it.id,
            x: it.x,
            y: it.y,
            w: it.w,
            h: it.h,
          })),
        },
      }));
    } else {
      setLayout((prev) => ({
        ...prev,
        items: newLayout.items,
      }));
    }
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

  // Mobile reorder helper: move widget up or down in single-column mobile view
  const handleMoveWidgetOrder = (widgetId: string, direction: "up" | "down") => {
    const currentMobileItems = effectiveMobileLayout(layout).items;
    const index = currentMobileItems.findIndex((i) => i.id === widgetId);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentMobileItems.length) return;

    const reordered = [...currentMobileItems];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    let curY = 0;
    const newPlacements = reordered.map((it) => {
      const res = { id: it.id, x: it.x, y: curY, w: it.w, h: it.h };
      curY += it.h;
      return res;
    });

    setLayout((prev) => ({
      ...prev,
      mobile: { items: newPlacements },
    }));
    setDirty(true);
  };

  return (
    <>
      <TopbarActions>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile: Moon (ThemeToggle) on the far left of action buttons */}
          {isPhone && <ThemeToggle />}

          {/* Desktop/Tablet View Mode Toggle */}
          {!isPhone && (
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
          )}

          {/* Reset Mobile Layout button on desktop preview */}
          {!isPhone && viewMode === "mobile" && (
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

          {/* Desktop Add Widget Button */}
          {!isPhone && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPaletteOpen(true)}
            >
              <Plus className="size-3.5" />
              <span>Add Widget</span>
            </Button>
          )}

          {/* Save Button (only visible when there are unsaved changes) */}
          {dirty && (
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="font-medium animate-in fade-in zoom-in-95 duration-150"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}

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

      <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden h-full min-h-0">
        {/* Canvas Area */}
        <div
          className={`flex-1 overflow-y-auto overscroll-contain canvas-dots flex justify-center ${
            isPhone ? "p-2 pb-28" : "p-4 sm:p-6"
          }`}
          onClick={() => setSelectedWidgetId(null)}
        >
          {loading ? (
            <div className="text-xs font-mono text-muted-foreground py-16">
              Loading editor...
            </div>
          ) : (
            <div
              className={`w-full transition-all duration-200 ${
                viewMode === "mobile" && !isPhone
                  ? "max-w-md bg-muted/60 p-3 rounded-2xl border-4 border-border shadow-xl my-4 self-start"
                  : "max-w-full"
              }`}
            >
              {/* Only show mobile mockup frame header on desktop preview mode */}
              {viewMode === "mobile" && !isPhone && (
                <div className="text-center pb-3 pt-1 border-b border-border mb-3">
                  <span className="text-xs font-mono font-medium tracking-wider text-muted-foreground uppercase">
                    Mobile Phone Viewport (Single Column)
                  </span>
                </div>
              )}

              <DashboardGrid
                key={isPhone ? "phone" : viewMode}
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

        {/* Desktop Right Slide-in Config Panel */}
        {!isPhone && selectedWidget && (
          <aside className="w-80 border-l border-border bg-card flex flex-col z-30 shrink-0 shadow-lg animate-in slide-in-from-right duration-150">
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

        {/* Mobile Bottom Sheet Config Drawer */}
        {isPhone && (
          <Drawer
            open={Boolean(selectedWidget)}
            onOpenChange={(open) => {
              if (!open) setSelectedWidgetId(null);
            }}
          >
            <DrawerContent className="max-h-[85vh] p-0">
              <DrawerHeader className="sr-only">
                <DrawerTitle>Widget Configuration</DrawerTitle>
              </DrawerHeader>
              <div className="h-full overflow-y-auto">
                {selectedWidget && (
                  <WidgetConfigPanel
                    item={selectedWidget}
                    availableVariables={variables}
                    onClose={() => setSelectedWidgetId(null)}
                    onUpdate={handleUpdateWidget}
                    onDuplicate={handleDuplicateWidget}
                    onRemove={handleRemoveWidget}
                  />
                )}
              </div>
            </DrawerContent>
          </Drawer>
        )}

        {/* Mobile Floating Bottom Action Toolbar */}
        {isPhone && (
          <div className="fixed bottom-4 inset-x-3 z-30 flex items-center justify-between gap-2 p-2 rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-2xl">
            {selectedWidget ? (
              // Actions when a widget is selected on mobile
              <div className="flex items-center justify-between w-full gap-1.5">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 text-xs font-medium"
                    onClick={() => handleMoveWidgetOrder(selectedWidget.id, "up")}
                    title="Move Up"
                  >
                    <ArrowUp className="size-3.5" />
                    <span>Up</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 text-xs font-medium"
                    onClick={() => handleMoveWidgetOrder(selectedWidget.id, "down")}
                    title="Move Down"
                  >
                    <ArrowDown className="size-3.5" />
                    <span>Down</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-2 text-xs"
                    onClick={() => handleDuplicateWidget(selectedWidget.id)}
                    title="Duplicate"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-9 px-2.5 text-xs font-medium"
                    onClick={() => handleRemoveWidget(selectedWidget.id)}
                  >
                    <Trash2 className="size-3.5" />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>
            ) : (
              // Default actions when no widget is selected on mobile
              <div className="flex items-center justify-between w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-xs"
                  onClick={handleResetMobileLayout}
                  title="Reset mobile order to match desktop positions"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset Order</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  className="flex-1 h-9 font-medium shadow-sm flex items-center justify-center gap-1.5"
                  onClick={() => setPaletteOpen(true)}
                >
                  <Plus className="size-4" />
                  <span>Add Widget</span>
                </Button>
              </div>
            )}
          </div>
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
                Discard & Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
