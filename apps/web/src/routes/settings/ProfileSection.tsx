"use client";

import React, { useState } from "react";
import { updateProfile } from "@/lib/api-client";
import { clearClientSessionAndRedirect } from "../auth/session";
import { HttpError } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ProfileSectionProps {
  initialUser: any;
}

export function ProfileSection({ initialUser }: ProfileSectionProps) {
  const [currentUser, setCurrentUser] = useState<any>(initialUser);
  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState(initialUser?.name || "");
  const [email, setEmail] = useState(initialUser?.email || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const initials = (() => {
    const n = (name || currentUser?.name || "").trim();
    if (n) {
      const parts = n.split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
    const local = (currentUser?.email || currentUser?.username || "").split("@")[0] || "";
    return local.slice(0, 2).toUpperCase() || "?";
  })();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updated = await updateProfile({ name, email });
      setCurrentUser((prev: any) => ({ ...prev, ...updated }));
      setProfileMsg({ type: "success", text: "Profile updated successfully." });
      setEditingProfile(false);
    } catch (err) {
      setProfileMsg({
        type: "error",
        text: err instanceof HttpError ? err.message : "Failed to update profile",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    await clearClientSessionAndRedirect("/login");
  };

  return (
    <section className="mb-4 rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-100 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 font-mono">
        Account
      </div>

      <div className="px-3.5 py-3.5 text-xs">
        {profileMsg && (
          <div
            className={`mb-3 p-2 rounded-xs text-xs flex items-center gap-2 ${
              profileMsg.type === "success"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800"
            }`}
          >
            {profileMsg.type === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{profileMsg.text}</span>
          </div>
        )}

        <div className="flex items-start gap-3.5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xs bg-neutral-100 text-sm font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 font-mono">
            {initials}
          </div>

          {!editingProfile ? (
            <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`truncate text-sm font-semibold ${
                      !currentUser?.name ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-100"
                    }`}
                  >
                    {currentUser?.name || "Add your name"}
                  </span>
                  {currentUser?.role && (
                    <span className="rounded-xs bg-neutral-100 px-1.5 py-0.2 text-[10px] font-mono uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {currentUser.role}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-neutral-500 dark:text-neutral-400 text-xs font-mono">
                  {currentUser?.email || currentUser?.username || "..."}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setName(currentUser?.name || "");
                    setEmail(currentUser?.email || "");
                    setEditingProfile(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  onClick={handleSignOut}
                >
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <form className="min-w-0 flex-1 space-y-3" onSubmit={handleSaveProfile}>
              <div className="truncate text-xs font-mono text-neutral-400">
                Username: {currentUser?.username || "—"}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Display name
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="mt-1 text-xs"
                    maxLength={80}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Email address
                  </span>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-1 text-xs"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setEditingProfile(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="xs" disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
