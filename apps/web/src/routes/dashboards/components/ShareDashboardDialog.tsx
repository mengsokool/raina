"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateShareToken, updateDashboard } from "@/lib/api-client";
import { HttpError } from "@/lib/http";
import { Copy, Check, RefreshCw } from "lucide-react";

interface ShareDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  dashboardTitle?: string;
  initialVisibility?: string;
  initialShareToken?: string | null;
  projectId?: string;
  onUpdated?: (updated: { visibility: string; shareToken: string | null }) => void;
}

type AccessOption = "public" | "users_only" | "disabled";

const OPTIONS: { id: AccessOption; title: string; desc: string }[] = [
  {
    id: "public",
    title: "1. Public access",
    desc: "Anyone with the link can view without signing in.",
  },
  {
    id: "users_only",
    title: "2. Restricted access",
    desc: "Requires login with configured user credentials.",
  },
  {
    id: "disabled",
    title: "3. Paused",
    desc: "Temporarily block all access via this link.",
  },
];

export function ShareDashboardDialog({
  open,
  onOpenChange,
  dashboardId,
  dashboardTitle,
  initialVisibility = "public",
  initialShareToken = null,
  onUpdated,
}: ShareDashboardDialogProps) {
  const normalizeVisibility = (v?: string): AccessOption => {
    if (v === "disabled" || v === "paused") return "disabled";
    if (v === "users_only" || v === "private") return "users_only";
    return "public";
  };

  const [visibility, setVisibility] = useState<AccessOption>(normalizeVisibility(initialVisibility));
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initShareData = useCallback(async () => {
    if (!dashboardId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await generateShareToken(dashboardId);
      setVisibility(normalizeVisibility(res.visibility));
      setShareToken(res.shareToken || res.share_token || null);
    } catch (err) {
      if (err instanceof HttpError) {
        setErrorMsg(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (open) {
      initShareData();
    }
  }, [open, initShareData]);

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined" || !shareToken) return "";
    return `${window.location.origin}/public/d/${shareToken}`;
  }, [shareToken]);

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectVisibility = async (nextOption: AccessOption) => {
    if (nextOption === visibility || saving) return;
    setVisibility(nextOption);
    setSaving(true);
    setErrorMsg(null);

    try {
      const res = await updateDashboard(dashboardId, {
        visibility: nextOption,
      });
      setVisibility(normalizeVisibility(res.visibility));
      const token = res.share_token || (res as any).publicToken || shareToken;
      if (token) setShareToken(token);
      onUpdated?.({
        visibility: nextOption,
        shareToken: token,
      });
    } catch (err) {
      setErrorMsg(err instanceof HttpError ? err.message : "Failed to update access policy");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await generateShareToken(dashboardId, { regenerate: true });
      const token = res.shareToken || res.share_token;
      setShareToken(token);
      onUpdated?.({
        visibility,
        shareToken: token,
      });
    } catch (err) {
      setErrorMsg(err instanceof HttpError ? err.message : "Failed to regenerate link");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 rounded-none border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-none">
        <DialogHeader className="p-0 space-y-1 text-left">
          <DialogTitle className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Share dashboard
          </DialogTitle>
          {dashboardTitle && (
            <DialogDescription className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {dashboardTitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {errorMsg && (
            <div className="rounded-none border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Share Link */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
              <span>Shareable link</span>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={saving || loading}
                className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${saving ? "animate-spin" : ""}`} />
                <span>Regenerate link</span>
              </button>
            </div>
            <div className="flex gap-1.5">
              <Input
                type="text"
                readOnly
                value={publicUrl || (loading ? "Generating..." : "")}
                className="h-8 text-xs font-mono rounded-none bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 select-all"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                disabled={!publicUrl || loading}
                className="h-8 px-3 rounded-none border-neutral-200 dark:border-neutral-800 gap-1.5 text-xs shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-neutral-900 dark:text-neutral-100" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Access Options (Radio Group) */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
              Who can access via this link:
            </div>

            <div className="space-y-1.5">
              {OPTIONS.map((opt) => {
                const isSelected = visibility === opt.id;
                return (
                  <label
                    key={opt.id}
                    onClick={() => handleSelectVisibility(opt.id)}
                    className={`flex items-start gap-3 p-2.5 border transition-colors cursor-pointer select-none ${
                      isSelected
                        ? "border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-800/50"
                        : "border-neutral-200 bg-white hover:bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/30"
                    }`}
                  >
                    <div className="pt-0.5">
                      <div
                        className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${
                          isSelected
                            ? "border-neutral-900 dark:border-neutral-100"
                            : "border-neutral-400 dark:border-neutral-600"
                        }`}
                      >
                        {isSelected && (
                          <div className="h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100 leading-none">
                        {opt.title}
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
