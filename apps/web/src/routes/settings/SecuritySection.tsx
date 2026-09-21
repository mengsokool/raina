"use client";

import React, { useState } from "react";
import { updateProfile } from "@/lib/api-client";
import { HttpError } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function SecuritySection() {
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match." });
      return;
    }

    setSavingPassword(true);
    try {
      await updateProfile({ currentPassword, newPassword });
      setPasswordMsg({ type: "success", text: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setEditingPassword(false);
    } catch (err) {
      setPasswordMsg({
        type: "error",
        text: err instanceof HttpError ? err.message : "Failed to change password",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="mb-4 rounded-sm border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
        Security
      </div>

      <ul className="divide-y divide-border text-xs">
        <li className="px-3.5 py-2.5">
          {passwordMsg && (
            <div
              className={`mb-2.5 p-2 rounded-xs text-xs flex items-center gap-2 ${
                passwordMsg.type === "success"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {passwordMsg.type === "success" ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <AlertCircle className="size-3.5 shrink-0" />
              )}
              <span>{passwordMsg.text}</span>
            </div>
          )}

          {!editingPassword ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  Password authentication
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Encrypted with cryptographic scrypt hash &amp; unique salt.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setEditingPassword(true)}
              >
                Change password
              </Button>
            </div>
          ) : (
            <form className="space-y-2.5" onSubmit={handleSavePassword}>
              <div className="font-medium text-foreground text-xs">
                Change your password
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="block text-xs font-medium text-foreground">
                    Current password
                  </span>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-foreground">
                    New password
                  </span>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Min 6 characters"
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-foreground">
                    Confirm new password
                  </span>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat new password"
                    className="mt-1"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setEditingPassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="xs" disabled={savingPassword}>
                  {savingPassword ? "Updating…" : "Update Password"}
                </Button>
              </div>
            </form>
          )}
        </li>
      </ul>
    </section>
  );
}
