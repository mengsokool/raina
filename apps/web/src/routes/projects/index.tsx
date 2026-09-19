import React, { useState, useMemo } from "react";
import { Link, useNavigate, useLoaderData } from "react-router";
import { useShell } from "@/components/ShellContext";
import { Plus, MoreVertical, Search, Folder, X } from "lucide-react";
import { Project } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject, deleteProject, listProjects, updateProject } from "@/lib/api-client";
import { getServerProjects } from "@/lib/server-loaders";

function relativeTime(ts: number | null): string {
  if (!ts) return "—";
  const ms = ts > 1e11 ? ts : ts * 1000;
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function meta() {
  return [
    { title: "Projects — raina" },
    { name: "description", content: "Manage your IoT projects and workspaces" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const initialProjects = await getServerProjects(request);
  return { initialProjects };
}

export default function ProjectsPage() {
  const { initialProjects } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { refreshProjects } = useShell();
  const [projects, setProjects] = useState<Project[]>(initialProjects as any || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit & Delete modals
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const loadProjects = async () => {
    try {
      const data = await listProjects();
      setProjects(data as any);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    setCreating(true);
    try {
      const created = await createProject({ name: n });
      setNewName("");
      setCreateOpen(false);
      await refreshProjects();
      navigate(`/p/${created.id}/dashboards`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setSaving(true);
    try {
      await updateProject(editingProject.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
      });
      setEditingProject(null);
      await Promise.all([loadProjects(), refreshProjects()]);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProject) return;
    try {
      await deleteProject(deletingProject.id);
      setProjects((prev) => prev.filter((p) => p.id !== deletingProject.id));
      setDeletingProject(null);
      await refreshProjects();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  return (
    <div className="mx-auto max-w-4xl px-2 py-3 sm:px-5 sm:py-6">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Projects
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {projects.length} workspace{projects.length === 1 ? "" : "s"}
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="self-start sm:self-auto gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New project</span>
        </Button>
      </header>

      <div className="mb-3 relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 z-10" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search projects..."
          className="pl-8 pr-7"
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((p) => (
            <div
              key={p.id}
              className="group relative flex items-center justify-between rounded-sm border border-neutral-200 bg-white p-2.5 transition hover:border-neutral-300 hover:shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <Link
                to={`/p/${p.id}/dashboards`}
                className="flex min-w-0 flex-1 items-center gap-2.5 pr-2"
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xs bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors">
                  <Folder className="h-3.5 w-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                      {p.name}
                    </span>
                  </div>
                  {p.description && (
                    <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {p.description}
                    </p>
                  )}
                </div>

                <div className="hidden sm:block shrink-0 text-[11px] font-mono text-neutral-400 mr-1.5">
                  <span>{relativeTime(p.created_at)}</span>
                </div>
              </Link>

              <div className="shrink-0 relative z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => e.stopPropagation()}
                      className="text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingProject(p);
                        setEditForm({ name: p.name, description: p.description || "" });
                      }}
                    >
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-950/40"
                      onClick={() => setDeletingProject(p)}
                    >
                      Delete project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-200 p-8 text-center text-xs text-neutral-400 dark:border-neutral-800">
            {searchQuery
              ? `No projects found matching "${searchQuery}"`
              : "No projects yet. Click “New project” to get started."}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">Name</label>
              <Input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">Description</label>
              <textarea
                rows={2}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingProject(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !editForm.name.trim()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={!!deletingProject} onOpenChange={(open) => !open && setDeletingProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete project &ldquo;{deletingProject?.name}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              This permanently removes everything in this project. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-500 dark:text-neutral-400">
            <li>All dashboards in this project</li>
            <li>All devices and their telemetry history</li>
            <li>All connection tokens scoped to this project</li>
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingProject(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
            >
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Project Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Add a new IoT project to manage dashboards, devices, and variables.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Project name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. Smart Farm, Factory B"
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
                onClick={() => {
                  setCreateOpen(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating..." : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
