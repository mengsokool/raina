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
    <section className="mb-4 rounded-sm border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
        Account
      </div>

      <div className="px-3.5 py-3.5 text-xs">
        {profileMsg && (
          <div
            className={`mb-3 p-2 rounded-xs text-xs flex items-center gap-2 ${
              profileMsg.type === "success"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {profileMsg.type === "success" ? (
              <CheckCircle2 className="size-3.5 shrink-0" />
            ) : (
              <AlertCircle className="size-3.5 shrink-0" />
            )}
            <span>{profileMsg.text}</span>
          </div>
        )}

        <div className="flex items-start gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-xs bg-muted text-sm font-semibold text-foreground border border-border font-mono">
            {initials}
          </div>

          {!editingProfile ? (
            <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`truncate text-sm font-semibold ${
                      !currentUser?.name ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {currentUser?.name || "Add your name"}
                  </span>
                  {currentUser?.role && (
                    <span className="rounded-xs bg-muted px-1.5 py-0.5 text-xs font-mono uppercase tracking-wide text-muted-foreground">
                      {currentUser.role}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-muted-foreground text-xs font-mono">
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
                  variant="destructive-outline"
                  size="xs"
                  onClick={handleSignOut}
                >
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <form className="min-w-0 flex-1 space-y-3" onSubmit={handleSaveProfile}>
              <div className="truncate text-xs font-mono text-muted-foreground">
                Username: {currentUser?.username || "—"}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-medium text-foreground">
                    Display name
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="mt-1"
                    maxLength={80}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-foreground">
                    Email address
                  </span>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-1"
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
