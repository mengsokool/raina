import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
import {
  integrations,
  IntegrationKind,
  ConnSpec,
  ConnField,
} from "@raina/workflow";
import { createIntegration, updateIntegration } from "@/lib/api-client";
import { IntegrationFieldInput } from "./IntegrationFieldInput";

export interface IntegrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: IntegrationKind | null;
  integration?: {
    id: string;
    name: string;
    kind: string;
    config?: unknown;
    enabled?: boolean;
  } | null;
  projectId: string;
  onSuccess: () => void;
}

export function IntegrationModal({
  open,
  onOpenChange,
  kind,
  integration,
  projectId,
  onSuccess,
}: IntegrationModalProps) {
  const activeKind = (kind || (integration?.kind as IntegrationKind)) ?? "http_service";
  const spec: ConnSpec = integrations.connSpec(activeKind);
  const fields: readonly ConnField[] = integrations.connectionFields(activeKind);

  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }

    if (integration) {
      setName(integration.name);
      const initialValues: Record<string, unknown> = {};
      const cfg = (integration.config as Record<string, unknown>) || {};
      for (const f of fields) {
        if (cfg[f.key] !== undefined && cfg[f.key] !== null) {
          initialValues[f.key] = cfg[f.key];
        } else {
          initialValues[f.key] = f.default ?? "";
        }
      }
      setValues(initialValues);
    } else {
      setName(`New ${spec.label}`);
      const initialValues: Record<string, unknown> = {};
      for (const f of fields) {
        initialValues[f.key] = f.default ?? "";
      }
      setValues(initialValues);
    }
  }, [open, integration, activeKind]);

  const updateField = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    const processedConfig: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      const strVal = typeof raw === "string" ? raw.trim() : raw;

      if (f.required && (strVal === undefined || strVal === null || strVal === "")) {
        setError(`${f.label} is required.`);
        return;
      }

      if (f.type === "json" && typeof strVal === "string" && strVal) {
        try {
          processedConfig[f.key] = JSON.parse(strVal);
        } catch {
          setError(`${f.label} must be valid JSON syntax.`);
          return;
        }
      } else if (strVal !== undefined && strVal !== "") {
        processedConfig[f.key] = strVal;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      if (integration) {
        await updateIntegration(projectId, integration.id, {
          name: trimmedName,
          config: processedConfig,
        });
      } else {
        await createIntegration(projectId, {
          name: trimmedName,
          kind: activeKind,
          config: processedConfig,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save integration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={spec.icon}
                />
              </svg>
            </div>
            <div>
              <DialogTitle>
                {integration ? `Edit ${spec.label}` : `Connect ${spec.label}`}
              </DialogTitle>
              <DialogDescription>
                {spec.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground">
              Connection name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${spec.label} alerts`}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {fields.map((f) => (
            <div key={f.key}>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-foreground">
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </label>
              </div>
              <div className="mt-1">
                <IntegrationFieldInput
                  field={f}
                  value={values[f.key]}
                  onChange={(val) => updateField(f.key, val)}
                  disabled={submitting}
                />
              </div>
              {f.hint && (
                <p className="mt-1 text-xs leading-4 text-muted-foreground">
                  {f.hint}
                </p>
              )}
            </div>
          ))}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !name.trim()}
            >
              {submitting && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}
              {submitting ? "Saving…" : integration ? "Save changes" : "Create integration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
