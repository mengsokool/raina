import React, { useState, useMemo } from "react";
import { Link, useNavigate, useLoaderData } from "react-router";
import { MoreVertical, Share2, Pencil, Trash2, Plus, LayoutDashboard, Search, X, Globe } from "lucide-react";
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
    <div className="mx-auto max-w-4xl px-2 py-3 sm:px-5 sm:py-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
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
            className="self-start sm:self-auto"
          >
            <Plus className="size-3.5" />
            <span>New dashboard</span>
          </Button>
        )}
      </header>

      <div className="mb-3.5 relative">
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

      <div className="space-y-1.5">
        {filteredDashboards.length > 0 ? (
          filteredDashboards.map((d) => (
            <div
              key={d.id}
              className="group relative flex items-center justify-between rounded-sm border border-border bg-card p-2.5 transition hover:border-foreground/40"
            >
              <Link
                to={`/p/${proj}/dashboards/${d.id}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 pr-2"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-xs bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                  <LayoutDashboard className="size-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-foreground transition-colors">
                      {d.name || d.title || "Untitled Dashboard"}
                    </span>
                    {d.visibility === "public" ? (
                      <span className="inline-flex items-center gap-1 rounded-xs bg-primary/10 px-1.5 py-0 text-xs font-mono font-medium text-primary border border-primary/20">
                        <Globe className="size-2.5" />
                        <span>Public</span>
                      </span>
                    ) : (
                      <span className="rounded-xs bg-muted px-1.5 py-0 text-xs font-mono text-muted-foreground">
                        Private
                      </span>
                    )}
                  </div>
                  {d.description ? (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">
                      {d.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Array.isArray(d.widgets) ? d.widgets.length : 0} widget{(d.widgets?.length || 0) === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </Link>

              <div className="shrink-0 relative z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                    >
                      <MoreVertical className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isClient && (
                      <DropdownMenuItem
                        onClick={() => navigate(`/p/${proj}/dashboards/${d.id}/edit`)}
                      >
                        <Pencil className="size-3.5" />
                        Edit layout
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setShareDialogDashboard(d)}
                    >
                      <Share2 className="size-3.5" />
                      Share &amp; Permissions
                    </DropdownMenuItem>
                    {!isClient && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeletingDashboard(d)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {searchQuery
              ? `No dashboards found matching "${searchQuery}"`
              : "No dashboards yet. Click “New dashboard” to get started."}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create dashboard</DialogTitle>
            <DialogDescription>
              Add a new dashboard to organize your widgets.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Dashboard name <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. Overview, Greenhouse, Floor 1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating..." : "Create dashboard"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingDashboard}
        onOpenChange={(open) => !open && setDeletingDashboard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete dashboard &ldquo;{deletingDashboard?.name || deletingDashboard?.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this dashboard? This action cannot be undone and all widgets within this dashboard will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteDashboard}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {shareDialogDashboard && (
        <ShareDashboardDialog
          open={!!shareDialogDashboard}
          onOpenChange={(open) => !open && setShareDialogDashboard(null)}
          dashboardId={shareDialogDashboard.id}
          dashboardTitle={shareDialogDashboard.name || shareDialogDashboard.title || "Dashboard"}
          initialVisibility={shareDialogDashboard.visibility || "private"}
          initialShareToken={shareDialogDashboard.publicToken || shareDialogDashboard.share_token || null}
          projectId={proj}
          onUpdated={(updated) => {
            setDashboards((prev) =>
              prev.map((d) =>
                d.id === shareDialogDashboard.id
                  ? {
                      ...d,
                      visibility: updated.visibility,
                      publicToken: updated.shareToken,
                      share_token: updated.shareToken,
                    }
                  : d
              )
            );
          }}
        />
      )}
    </div>
  );
}
