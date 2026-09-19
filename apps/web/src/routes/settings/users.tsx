import React, { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import { Plus, Search, X, Pencil, Trash2 } from "lucide-react";
import {
  listProjectUsers,
  createProjectUser,
  updateProjectUser,
  deleteProjectUser,
  listDashboards,
} from "@/lib/api-client";
import { getServerProjectUsers, getServerDashboards } from "@/lib/server-loaders";
import { ProjectUser, DashboardMeta } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ProjectUsersViewProps {
  proj: string;
  initialUsers: ProjectUser[];
  initialDashboards: DashboardMeta[];
}

export function ProjectUsersView({
  proj,
  initialUsers,
  initialDashboards,
}: ProjectUsersViewProps) {
  const [users, setUsers] = useState<ProjectUser[]>(initialUsers);
  const [dashboards, setDashboards] = useState<DashboardMeta[]>(initialDashboards);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setError] = useState<string | null>(null);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ProjectUser | null>(null);

  // Form Fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accessAllDashboards, setAccessAllDashboards] = useState(false);
  const [selectedDashboardIds, setSelectedDashboardIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete State
  const [deletingUser, setDeletingUser] = useState<ProjectUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, dashesData] = await Promise.all([
        listProjectUsers(proj),
        listDashboards(proj),
      ]);
      setUsers(usersData as any);
      setDashboards(dashesData as any);
    } catch (err: any) {
      setError(err.message || "Failed to load project users");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setUsername("");
    setPassword("");
    setName("");
    setAccessAllDashboards(false);
    setSelectedDashboardIds(dashboards.length > 0 ? [dashboards[0].id] : []);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: ProjectUser) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword("");
    setName(user.name || "");
    setAccessAllDashboards(user.accessAllDashboards);
    setSelectedDashboardIds(user.dashboardAccess.map((d) => d.dashboardId));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!editingUser && (!cleanUsername || !password)) {
      setFormError("Username and password are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingUser) {
        await updateProjectUser(proj, editingUser.id, {
          name: name.trim() || undefined,
          password: password ? password : undefined,
          accessAllDashboards,
          dashboardIds: accessAllDashboards ? [] : selectedDashboardIds,
        });
      } else {
        await createProjectUser(proj, {
          username: cleanUsername,
          password,
          name: name.trim() || undefined,
          accessAllDashboards,
          dashboardIds: accessAllDashboards ? [] : selectedDashboardIds,
        });
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await deleteProjectUser(proj, deletingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setDeletingUser(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleDashboard = (dashId: string) => {
    setSelectedDashboardIds((prev) =>
      prev.includes(dashId) ? prev.filter((id) => id !== dashId) : [...prev, dashId]
    );
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  return (
    <div className="mx-auto max-w-4xl px-2 py-3 sm:px-5 sm:py-6">
      {/* Minimal Header */}
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Users
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {users.length} user{users.length === 1 ? "" : "s"} · Project client accounts
          </p>
        </div>

        <Button
          type="button"
          onClick={openCreateModal}
          className="self-start sm:self-auto gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New user</span>
        </Button>
      </header>

      {/* Search Bar */}
      <div className="mb-3.5 relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 z-10" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users..."
          className="pl-8 pr-8"
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

      {/* High-Density Flat Table */}
      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <div className="space-y-1.5 p-3">
            <div className="h-8 animate-pulse rounded-xs bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-8 animate-pulse rounded-xs bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ) : filteredUsers.length > 0 ? (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-100 bg-neutral-50 uppercase tracking-wider text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 font-mono text-[10px]">
              <tr>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Dashboard Access</th>
                <th className="px-3 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {filteredUsers.map((u) => {
                const assignedNames = u.dashboardAccess
                  .map((da) => da.dashboardName || da.dashboardId)
                  .join(", ");

                return (
                  <tr
                    key={u.id}
                    className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                        {u.username}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <span className="text-neutral-600 dark:text-neutral-300">
                        {u.name || "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="font-mono uppercase text-[10px]">
                        {u.role || "client"}
                      </Badge>
                    </td>

                    <td className="px-3 py-2">
                      {u.accessAllDashboards ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          All dashboards
                        </span>
                      ) : assignedNames ? (
                        <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-xs inline-block" title={assignedNames}>
                          {assignedNames}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-500">
                          None
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEditModal(u)}
                          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeletingUser(u)}
                          className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
            {searchQuery ? "No matching users found." : "No users created yet."}
          </div>
        )}
      </div>

      {/* Create / Edit User Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? `Edit User (@${editingUser.username})` : "New User"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update user details, credentials, or dashboard access."
                : "Create a user account and choose which dashboards they can access."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Username {!editingUser && <span className="text-red-500">*</span>}
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!!editingUser}
                  placeholder="e.g. client_greenhouse"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Password {!editingUser && <span className="text-red-500">*</span>}
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? "Leave empty to keep unchanged" : "••••••••"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Display Name (optional)
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Somying Farm"
                />
              </div>

              <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Dashboard Access
                </label>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-neutral-800 dark:text-neutral-200 cursor-pointer">
                    <input
                      type="radio"
                      name="dashboard_access"
                      checked={accessAllDashboards}
                      onChange={() => setAccessAllDashboards(true)}
                      className="accent-neutral-900 dark:accent-neutral-100"
                    />
                    <span>All dashboards in this project</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-neutral-800 dark:text-neutral-200 cursor-pointer">
                    <input
                      type="radio"
                      name="dashboard_access"
                      checked={!accessAllDashboards}
                      onChange={() => setAccessAllDashboards(false)}
                      className="accent-neutral-900 dark:accent-neutral-100"
                    />
                    <span>Specific dashboards</span>
                  </label>
                </div>

                {!accessAllDashboards && (
                  <div className="mt-2.5 max-h-36 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-950/40 space-y-1.5">
                    {dashboards.length === 0 ? (
                      <p className="text-[11px] text-neutral-400">No dashboards in this project yet.</p>
                    ) : (
                      dashboards.map((dash) => (
                        <label
                          key={dash.id}
                          className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer hover:text-neutral-900 dark:hover:text-white"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDashboardIds.includes(dash.id)}
                            onChange={() => toggleDashboard(dash.id)}
                            className="accent-neutral-900 dark:accent-neutral-100 rounded"
                          />
                          <span className="truncate">{dash.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : editingUser ? "Save changes" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user {deletingUser?.username}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingUser(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function meta() {
  return [
    { title: "Project Users — raina" },
    { name: "description", content: "Manage project member access and dashboard permissions" },
  ];
}

export async function loader({ params, request }: { params: { proj?: string }; request: Request }) {
  const proj = params.proj || "";
  const [initialUsers, initialDashboards] = await Promise.all([
    proj ? getServerProjectUsers(proj, request) : [],
    proj ? getServerDashboards(proj, request) : [],
  ]);
  return { proj, initialUsers, initialDashboards };
}

export default function ProjectUsersPage() {
  const { proj, initialUsers, initialDashboards } = useLoaderData<typeof loader>();
  return (
    <ProjectUsersView
      proj={proj}
      initialUsers={initialUsers as any}
      initialDashboards={initialDashboards as any}
    />
  );
}
