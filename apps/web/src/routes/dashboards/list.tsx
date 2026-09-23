import React, { useState, useMemo } from "react";
import { Link, useNavigate, useLoaderData } from "react-router";
import {
  MoreVertical,
  Share2,
  Pencil,
  Trash2,
  Plus,
  LayoutDashboard,
  Search,
  X,
  Globe,
  Lock,
  Users,
} from "lucide-react";
import { useShell } from "@/components/ShellContext";
import { createDashboard, deleteDashboard } from "@/lib/api-client";
import { getServerDashboards } from "@/lib/server-loaders";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareDashboardDialog } from "./components/ShareDashboardDialog";

interface DashboardItem {
  id: string;
  name?: string;
  title?: string;
  description?: string | null;
  visibility?: string;
  publicToken?: string | null;
  share_token?: string | null;
  widgets?: unknown[];
  created_at: number;
  updated_at?: number;
}

export function meta() {
  return [
    { title: "Dashboards — raina" },
    { name: "description", content: "View and manage IoT dashboards" },
  ];
}

export async function loader({ params, request }: { params: { proj: string }; request: Request }) {
  const proj = params.proj;
  const initialDashboards = await getServerDashboards(proj, request);
  return { proj, initialDashboards };
}

export default function DashboardsListPage() {
  const { proj, initialDashboards } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { isClient } = useShell();

  const [dashboards, setDashboards] = useState<DashboardItem[]>(initialDashboards as any || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [shareDialogDashboard, setShareDialogDashboard] = useState<DashboardItem | null>(null);
  const [deletingDashboard, setDeletingDashboard] = useState<DashboardItem | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    try {
      const created = await createDashboard({
        project_id: proj,
        title: newName.trim(),
        description: null,
        widgets: [],
      });
      setNewName("");
      setCreateOpen(false);
      navigate(`/p/${proj}/dashboards/${created.id}/edit`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDashboard = async () => {
    if (!deletingDashboard) return;
    try {
      await deleteDashboard(deletingDashboard.id);
      setDashboards((prev) => prev.filter((d) => d.id !== deletingDashboard.id));
      setDeletingDashboard(null);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredDashboards = useMemo(() => {
    if (!searchQuery.trim()) return dashboards;
    const q = searchQuery.toLowerCase();
    return dashboards.filter(
      (d) =>
        (d.name || d.title || "").toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
    );
  }, [dashboards, searchQuery]);

  return (
    <div className="w-full max-w-5xl mx-auto px-2 py-3 sm:px-5 sm:py-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Dashboards
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dashboards.length} dashboard{dashboards.length === 1 ? "" : "s"}
          </p>
        </div>

        {!isClient && (
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="shrink-0"
          >
            <Plus className="size-3.5" />
            <span>New dashboard</span>
          </Button>
        )}
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          type="text"
          variant="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search dashboards..."
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      <div>
        {filteredDashboards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredDashboards.map((d) => (
              <div
                key={d.id}
                className="group relative flex flex-col justify-between rounded-lg border border-border/80 bg-card p-3.5 transition hover:border-foreground/30 hover:shadow-xs"
              >
                {/* Clickable Card Link */}
                <Link
                  to={`/p/${proj}/dashboards/${d.id}`}
                  className="absolute inset-0 z-0 rounded-lg"
                  aria-label={d.name || d.title || "Dashboard"}
                />

                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <LayoutDashboard className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <h3 className="truncate text-xs font-semibold text-foreground">
                        {d.name || d.title || "Untitled Dashboard"}
                      </h3>
                    </div>

                    <div className="relative z-10 flex items-center gap-1 shrink-0">
                      {/* Status Icon */}
                      {d.visibility === "public" ? (
                        <span title="Public (Shared)">
                          <Globe className="size-3.5 text-primary" />
                        </span>
                      ) : d.visibility === "users_only" ? (
                        <span title="Project Users Only">
                          <Users className="size-3.5 text-amber-500" />
                        </span>
                      ) : (
                        <span title="Private">
                          <Lock className="size-3.5 text-muted-foreground/70" />
                        </span>
                      )}

                      {/* 3-dots Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-foreground -mr-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 z-30">
                          {!isClient && (
                            <DropdownMenuItem
                              onClick={() => navigate(`/p/${proj}/dashboards/${d.id}/edit`)}
                              className="cursor-pointer"
                            >
                              <Pencil className="size-3.5" />
                              <span>Edit layout</span>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setShareDialogDashboard(d)}
                            className="cursor-pointer"
                          >
                            <Share2 className="size-3.5" />
                            <span>Share &amp; Permissions</span>
                          </DropdownMenuItem>
                          {!isClient && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeletingDashboard(d)}
                                className="cursor-pointer"
                              >
                                <Trash2 className="size-3.5" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {d.description && (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {d.description}
                    </p>
                  )}
                </div>

                <div className="mt-3.5 flex items-center justify-between text-[11px] font-mono text-muted-foreground/80">
                  <span>
                    {Array.isArray(d.widgets) ? d.widgets.length : 0} widget
                    {(d.widgets?.length || 0) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {searchQuery
              ? `No dashboards found matching "${searchQuery}"`
              : "No dashboards yet. Click “New dashboard” to get started."}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New Dashboard</DialogTitle>
              <DialogDescription>
                Create a visual layout canvas for charts, metrics, and remote controls.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-2">
              <label htmlFor="dashboard-title-input" className="text-xs font-semibold text-foreground">
                Dashboard Title
              </label>
              <Input
                id="dashboard-title-input"
                autoFocus
                placeholder="e.g. Greenhouse 1 Climate"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating..." : "Create & Edit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share & Permissions Dialog */}
      {shareDialogDashboard && (
        <ShareDashboardDialog
          open={Boolean(shareDialogDashboard)}
          onOpenChange={(open) => {
            if (!open) setShareDialogDashboard(null);
          }}
          dashboardId={shareDialogDashboard.id}
          dashboardTitle={shareDialogDashboard.name || shareDialogDashboard.title || "Dashboard"}
          initialVisibility={(shareDialogDashboard.visibility as any) || "private"}
          initialShareToken={shareDialogDashboard.share_token || shareDialogDashboard.publicToken || null}
          projectId={proj}
          onUpdated={(updated) => {
            setDashboards((prev) =>
              prev.map((it) =>
                it.id === shareDialogDashboard.id
                  ? {
                      ...it,
                      visibility: updated.visibility,
                      share_token: updated.shareToken,
                      publicToken: updated.shareToken,
                    }
                  : it
              )
            );
          }}
        />
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(deletingDashboard)}
        onOpenChange={(open) => {
          if (!open) setDeletingDashboard(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dashboard</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">
                {deletingDashboard?.name || deletingDashboard?.title || "this dashboard"}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              onClick={handleDeleteDashboard}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
