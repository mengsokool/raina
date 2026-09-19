"use client";

import React from "react";
import { Trash2, X, AlertCircle } from "lucide-react";
import { blocks, integrations as sharedIntegrations } from "@raina/workflow";
import { FlowNode } from "./BlockNode";
import { Variable, Device, Integration, WEEKDAYS } from "../utils/types";
import { BlockIcon, getBlockTheme } from "../utils/block-icons";
import { IntegrationFieldInput } from "@/components/integrations/IntegrationFieldInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useIsMobile } from "@/lib/useViewport";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";

type InspectorProps = {
  node: FlowNode;
  variables: Variable[];
  devices: Device[];
  integrations: Integration[];
  update: (key: string, value: unknown) => void;
  remove: () => void;
  close: () => void;
};

const coerce = (type: string, value: string | boolean) => {
  if (type === "number" && typeof value === "string") {
    return value === "" ? "" : Number(value);
  }
  return value;
};

export function Inspector({
  node,
  variables,
  devices,
  integrations,
  update,
  remove,
  close,
}: InspectorProps) {
  const isMobile = useIsMobile();
  const block = blocks.findBlock(node.data.kind);
  const config = node.data.config || {};
  const errors = node.data.errors || {};
  const theme = getBlockTheme(node.data.kind);

  // Stop keyboard events from propagating to ReactFlow (e.g. Backspace, Delete, Ctrl+Z)
  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  if (isMobile) {
    return (
      <Drawer
        modal={false}
        open={Boolean(node)}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        <DrawerContent
          hideOverlay
          onPointerDownOutside={(e) => {
            // Prevent outside clicks on canvas or other blocks from dismissing the drawer.
            // Selection changes are managed by canvas clicks directly.
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          data-testid="inspector-panel"
          className="fixed bottom-0 left-0 right-0 max-h-[70vh] rounded-t-[16px] bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex flex-col focus:outline-none pointer-events-auto"
          onKeyDownCapture={handleKeyDownCapture}
        >
          <div className="flex h-full max-h-[70vh] flex-col overflow-hidden">
            <DrawerHeader className="border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeIcon}`}
                  >
                    <BlockIcon kind={node.data.kind} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="flex items-center gap-1.5 leading-none">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        {block?.category ?? "block"}
                      </span>
                      <span className="text-[9px] text-neutral-400 dark:text-neutral-500">• ID: {node.id.slice(0, 8)}</span>
                    </div>
                    <DrawerTitle className="mt-1 text-sm font-semibold text-neutral-950 dark:text-white truncate">
                      {block?.label ?? node.data.kind}
                    </DrawerTitle>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    data-testid="inspector-delete-node"
                    type="button"
                    onClick={() => {
                      remove();
                      close();
                    }}
                    className="rounded-lg p-2 text-neutral-500 transition hover:bg-red-50 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    aria-label="Delete selected block"
                    title="Delete block (Del)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <DrawerClose asChild>
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                      aria-label="Close block inspector"
                      title="Close inspector"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DrawerClose>
                </div>
              </div>
              <DrawerDescription className="sr-only">
                {block?.description || "Block configuration"}
              </DrawerDescription>
            </DrawerHeader>

            <div
              data-vaul-no-drag
              className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 space-y-4"
            >
              <InspectorForm
                node={node}
                block={block}
                config={config}
                errors={errors}
                variables={variables}
                devices={devices}
                integrations={integrations}
                update={update}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside
      data-testid="inspector-panel"
      onKeyDownCapture={handleKeyDownCapture}
      className="flex w-88 shrink-0 flex-col border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeIcon}`}
          >
            <BlockIcon kind={node.data.kind} className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span
                className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                {block?.category ?? "block"}
              </span>
              <span className="text-[9px] text-neutral-400 dark:text-neutral-500">• ID: {node.id.slice(0, 8)}</span>
            </div>
            <h2 className="mt-1 text-xs font-semibold text-neutral-950 dark:text-white tracking-tight truncate leading-tight">
              {block?.label ?? node.data.kind}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-testid="inspector-delete-node"
            type="button"
            onClick={remove}
            className="rounded-lg p-2 text-neutral-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-neutral-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
            aria-label="Delete selected block"
            title="Delete block (Del)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label="Close block inspector"
            title="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-5">
        <InspectorForm
          node={node}
          block={block}
          config={config}
          errors={errors}
          variables={variables}
          devices={devices}
          integrations={integrations}
          update={update}
        />
      </div>
    </aside>
  );
}

function InspectorForm({
  node,
  block,
  config,
  errors,
  variables,
  devices,
  integrations,
  update,
}: {
  node: FlowNode;
  block: blocks.BlockManifest | undefined;
  config: Record<string, unknown>;
  errors: Record<string, string>;
  variables: Variable[];
  devices: Device[];
  integrations: Integration[];
  update: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{block?.description}</p>

      {!block?.fields.length ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 text-center dark:border-neutral-800 dark:bg-neutral-950/50">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">This block requires no additional configuration.</p>
        </div>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          {block.fields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={config[field.key]}
              error={errors[field.key]}
              update={update}
              variables={variables}
              devices={devices}
              integrations={integrations}
            />
          ))}
          {node.data.kind === "call_integration" && (
            <IntegrationActionSection
              integrationId={config.integration_id ? String(config.integration_id) : ""}
              operation={config.operation ? String(config.operation) : undefined}
              params={(config.params as Record<string, unknown>) || {}}
              integrations={integrations}
              update={update}
            />
          )}
        </form>
      )}
    </>
  );
}

function ConfigField({
  field,
  value,
  error,
  update,
  variables,
  devices,
  integrations,
}: {
  field: blocks.BlockField;
  value: unknown;
  error?: string;
  update: (key: string, value: unknown) => void;
  variables: Variable[];
  devices: Device[];
  integrations: Integration[];
}) {
  const common = `mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-500 ${
    error ? "border-red-500" : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
  }`;

  const valueString =
    value === undefined || value === null
      ? (field.default !== undefined ? String(field.default) : "")
      : String(value);

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">
        <span>{field.label}</span>
        {field.required && <span className="ml-1 text-red-500 dark:text-red-400">*</span>}
      </label>

      {field.type === "variable" ? (
        <Select
          value={valueString || "__none__"}
          onValueChange={(val) => update(field.key, val === "__none__" ? "" : val)}
        >
          <SelectTrigger
            data-testid={`inspector-input-${field.key}`}
            className="mt-1.5 w-full bg-white text-xs text-neutral-900 border-neutral-300 dark:bg-neutral-950 dark:text-white dark:border-neutral-700"
          >
            <SelectValue placeholder="Select variable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select variable</SelectItem>
            {variables.map((variable) => (
              <SelectItem key={variable.id} value={variable.key}>
                {variable.key} {variable.unit ? `(${variable.unit})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "device" ? (
        <Select
          value={valueString || "__none__"}
          onValueChange={(val) => update(field.key, val === "__none__" ? "" : val)}
        >
          <SelectTrigger
            data-testid={`inspector-input-${field.key}`}
            className="mt-1.5 w-full bg-white text-xs text-neutral-900 border-neutral-300 dark:bg-neutral-950 dark:text-white dark:border-neutral-700"
          >
            <SelectValue placeholder="Any device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Any device</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "integration" ? (
        <Select
          value={valueString || "__none__"}
          onValueChange={(val) => {
            const id = val === "__none__" ? "" : val;
            update(field.key, id);
            const found = integrations.find((item) => item.id === id);
            if (found) {
              const ops = sharedIntegrations.connOperations(found.kind as sharedIntegrations.IntegrationKind);
              if (ops[0]) {
                update("operation", ops[0].key);
                const defaults: Record<string, unknown> = {};
                for (const f of sharedIntegrations.operationFields(found.kind as sharedIntegrations.IntegrationKind, ops[0].key)) {
                  if (f.default !== undefined) defaults[f.key] = f.default;
                }
                update("params", defaults);
              }
            }
          }}
        >
          <SelectTrigger
            data-testid={`inspector-input-${field.key}`}
            className="mt-1.5 w-full bg-white text-xs text-neutral-900 border-neutral-300 dark:bg-neutral-950 dark:text-white dark:border-neutral-700"
          >
            <SelectValue placeholder="Select integration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select integration</SelectItem>
            {integrations
              .filter((item) => item.enabled)
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.kind})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      ) : field.type === "weekdays" ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={`inspector-input-${field.key}`}>
          {WEEKDAYS.map(([day, label]) => {
            const arr = Array.isArray(value) ? (value as number[]) : [];
            const selected = arr.includes(day);
            return (
              <button
                key={day}
                type="button"
                data-testid={`weekday-${day}`}
                onClick={() =>
                  update(
                    field.key,
                    selected ? arr.filter((d) => d !== day) : [...arr, day]
                  )
                }
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 ${
                  selected
                    ? "border-lime-500 bg-lime-100 text-lime-900 dark:border-lime-400 dark:bg-lime-950/60 dark:text-lime-300"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-950 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : field.type === "boolean" ? (
        <div className="pt-1">
          <button
            data-testid={`inspector-input-${field.key}`}
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            onClick={() => update(field.key, !value)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 ${
              value ? "bg-lime-400 dark:bg-lime-400" : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                value ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      ) : field.type === "textarea" || field.type === "json" ? (
        <textarea
          data-testid={`inspector-input-${field.key}`}
          value={valueString}
          onChange={(e) => update(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${common} min-h-20 resize-y ${field.mono ? "font-mono" : ""}`}
        />
      ) : field.type === "select" ? (
        <Select
          value={valueString}
          onValueChange={(val) => update(field.key, val)}
        >
          <SelectTrigger
            data-testid={`inspector-input-${field.key}`}
            className="mt-1.5 w-full bg-white text-xs text-neutral-900 border-neutral-300 dark:bg-neutral-950 dark:text-white dark:border-neutral-700"
          >
            <SelectValue placeholder="Select option" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <input
          data-testid={`inspector-input-${field.key}`}
          type={field.type === "number" ? "number" : field.type === "time" ? "time" : "text"}
          value={valueString}
          onChange={(e) => update(field.key, coerce(field.type, e.target.value))}
          placeholder={field.placeholder}
          className={`${common} ${field.mono ? "font-mono" : ""}`}
        />
      )}

      {error && (
        <p
          data-testid={`inspector-error-${field.key}`}
          className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400 mt-1"
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}

      {field.hint && !error && (
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{field.hint}</p>
      )}
    </div>
  );
}

function IntegrationActionSection({
  integrationId,
  operation,
  params,
  integrations,
  update,
}: {
  integrationId: string;
  operation?: string;
  params: Record<string, unknown>;
  integrations: Integration[];
  update: (key: string, value: unknown) => void;
}) {
  const selected = integrations.find((i) => i.id === integrationId);
  if (!selected) return null;

  const kind = selected.kind as sharedIntegrations.IntegrationKind;
  const ops = sharedIntegrations.connOperations(kind);
  const currentOp = operation || ops[0]?.key || "";
  const opFields = sharedIntegrations.operationFields(kind, currentOp);

  const handleParamChange = (k: string, v: unknown) => {
    update("params", {
      ...params,
      [k]: v,
    });
  };

  return (
    <div className="space-y-3.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      {ops.length > 1 && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">
            Operation
          </label>
          <Select
            value={currentOp}
            onValueChange={(val) => {
              update("operation", val);
              const defaults: Record<string, unknown> = { ...params };
              for (const f of sharedIntegrations.operationFields(kind, val)) {
                if (defaults[f.key] === undefined && f.default !== undefined) {
                  defaults[f.key] = f.default;
                }
              }
              update("params", defaults);
            }}
          >
            <SelectTrigger className="mt-1.5 w-full bg-white text-xs text-neutral-900 border-neutral-300 dark:bg-neutral-950 dark:text-white dark:border-neutral-700">
              <SelectValue placeholder="Select operation" />
            </SelectTrigger>
            <SelectContent>
              {ops.map((op) => (
                <SelectItem key={op.key} value={op.key}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {opFields.length > 0 && (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Action Parameters
          </div>
          {opFields.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                <span>{f.label}</span>
                {f.required && <span className="ml-1 text-red-500 dark:text-red-400">*</span>}
              </label>
              <IntegrationFieldInput
                field={f}
                value={params[f.key] !== undefined ? params[f.key] : f.default ?? ""}
                onChange={(val) => handleParamChange(f.key, val)}
              />
              {f.hint && (
                <p className="text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-500">
                  {f.hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

