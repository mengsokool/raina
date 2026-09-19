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
    <section className="mb-4 rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-100 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 font-mono">
        Security
      </div>

      <ul className="divide-y divide-neutral-100 text-xs dark:divide-neutral-800">
        <li className="px-3.5 py-2.5">
          {passwordMsg && (
            <div
              className={`mb-2.5 p-2 rounded-xs text-xs flex items-center gap-2 ${
                passwordMsg.type === "success"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800"
              }`}
            >
              {passwordMsg.type === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{passwordMsg.text}</span>
            </div>
          )}

          {!editingPassword ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                  Password authentication
                </div>
                <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
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
              <div className="font-medium text-neutral-900 dark:text-neutral-100 text-xs">
                Change your password
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Current password
                  </span>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="mt-1 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    New password
                  </span>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Min 6 characters"
                    className="mt-1 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Confirm new password
                  </span>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat new password"
                    className="mt-1 text-xs"
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
