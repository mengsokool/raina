import React, { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import { Plus, Search, X, Pencil, Trash2 } from "lucide-react";
import { listStaff, createStaff, updateStaff, deleteStaff } from "@/lib/api-client";
import { getServerStaff } from "@/lib/server-loaders";
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

export interface StaffMember {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  role: string;
  lastLoginAt: number | null;
  createdAt: number;
}

interface StaffManagementViewProps {
  initialStaff?: StaffMember[];
}

export function StaffManagementView({ initialStaff = [] }: StaffManagementViewProps) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form Fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete State
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const data = await listStaff();
      setStaff(data);
    } catch (e: any) {
      console.error("Failed to load staff", e);
      setError(e.message || "Failed to load staff members");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingStaff(null);
    setUsername("");
    setPassword("");
    setName("");
    setEmail("");
    setRole("staff");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (s: StaffMember) => {
    setEditingStaff(s);
    setUsername(s.username);
    setPassword("");
    setName(s.name || "");
    setEmail(s.email || "");
    setRole(s.role || "staff");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!editingStaff && (!cleanUsername || !password)) {
      setFormError("Username and password are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingStaff) {
        await updateStaff(editingStaff.id, {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          password: password ? password : undefined,
          role,
        });
      } else {
        await createStaff({
          username: cleanUsername,
          password,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          role: role as "admin" | "staff",
        });
      }

      setIsModalOpen(false);
      await fetchStaff();
    } catch (err: any) {
      setFormError(err.message || "Failed to save staff member");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStaff) return;
    setIsDeleting(true);
    try {
      await deleteStaff(deletingStaff.id);
      setStaff((prev) => prev.filter((s) => s.id !== deletingStaff.id));
      setDeletingStaff(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete staff member");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return staff;
    const q = searchQuery.toLowerCase();
    return staff.filter(
      (s) =>
        s.username.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
    );
  }, [staff, searchQuery]);

  return (
    <div className="mx-auto max-w-4xl px-2 py-3 sm:px-5 sm:py-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Staff
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {staff.length} staff member{staff.length === 1 ? "" : "s"} · Back-office team accounts
          </p>
        </div>

        <Button
          type="button"
          onClick={openCreateModal}
          className="self-start sm:self-auto gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New staff</span>
        </Button>
      </header>

      {error && (
        <div className="mb-3.5 rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-3.5 relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 z-10" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search staff..."
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

      <div className="overflow-hidden rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <div className="space-y-1.5 p-3">
            <div className="h-8 animate-pulse rounded-xs bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-8 animate-pulse rounded-xs bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ) : filteredStaff.length > 0 ? (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-100 bg-neutral-50 uppercase tracking-wider text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 font-mono text-[10px]">
              <tr>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {filteredStaff.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                >
                  <td className="px-3 py-2">
                    <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                      {s.username}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <span className="text-neutral-600 dark:text-neutral-300">
                      {s.name || "—"}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                      {s.email || "—"}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="font-mono uppercase text-[10px]">
                      {s.role}
                    </Badge>
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEditModal(s)}
                        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {s.role !== "owner" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeletingStaff(s)}
                          className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
            {searchQuery ? "No matching staff members found." : "No staff members found."}
          </div>
        )}
      </div>

      {/* Create / Edit Staff Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? `Edit Staff (@${editingStaff.username})` : "New Staff Member"}
            </DialogTitle>
            <DialogDescription>
              {editingStaff
                ? "Update staff credentials or information."
                : "Create a staff member account with platform back-office access."}
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
                  Username {!editingStaff && <span className="text-red-500">*</span>}
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!!editingStaff}
                  placeholder="e.g. staff_john"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Password {!editingStaff && <span className="text-red-500">*</span>}
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingStaff ? "Leave empty to keep unchanged" : "••••••••"}
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
                  placeholder="e.g. John Doe"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Email (optional)
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={editingStaff?.role === "owner"}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
                >
                  <option value="staff">Staff (Back-office access)</option>
                  <option value="admin">Admin (Project administration)</option>
                  {editingStaff?.role === "owner" && <option value="owner">Owner</option>}
                </select>
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
                {saving ? "Saving..." : editingStaff ? "Save changes" : "Create staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingStaff} onOpenChange={(open) => !open && setDeletingStaff(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete staff member {deletingStaff?.username}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingStaff(null)}
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
    { title: "Staff Management — raina" },
    { name: "description", content: "Manage platform staff and administrative credentials" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const initialStaff = await getServerStaff(request);
  return { initialStaff };
}

export default function BackOfficeStaffPage() {
  const { initialStaff } = useLoaderData<typeof loader>();
  return <StaffManagementView initialStaff={initialStaff as any} />;
}
