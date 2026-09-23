"use client";

import React from "react";
import { widgets } from "../widgets";
import { WidgetInstance } from "@/types";
import { Copy, Trash2, X, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VarOption {
  key: string;
  unit?: string;
}

function typeDefault(f: any): unknown {
  if (f.default !== undefined) return f.default;
  if (f.type === "number") return 0;
  if (f.type === "boolean") return false;
  if (f.type === "color") return "#22c55e";
  return "";
}

function buildRow(fields: ReadonlyArray<any>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "group" && f.fields) {
      Object.assign(row, buildRow(f.fields));
    } else if (f.key) {
      row[f.key] = typeDefault(f);
    }
  }
  return row;
}

function isFieldVisible(f: any, model: Record<string, any>, defaultProps: Record<string, any> = {}): boolean {
  if (!f.showWhen) return true;
  const val = model[f.showWhen.key] !== undefined ? model[f.showWhen.key] : defaultProps[f.showWhen.key];
  return val === f.showWhen.equals;
}

function ConfigField({
  field,
  model,
  defaultProps = {},
  availableVariables,
  onChange,
  className = "",
}: {
  field: any;
  model: Record<string, any>;
  defaultProps?: Record<string, any>;
  availableVariables: VarOption[];
  onChange: (key: string, value: any) => void;
  className?: string;
}) {
  if (!isFieldVisible(field, model, defaultProps)) return null;

  const fieldKey = field.key;
  let currentVal: any = "";
  if (fieldKey !== undefined) {
    if (model[fieldKey] !== undefined && model[fieldKey] !== null) {
      currentVal = model[fieldKey];
    } else if (defaultProps[fieldKey] !== undefined && defaultProps[fieldKey] !== null) {
      currentVal = defaultProps[fieldKey];
    } else if (field.default !== undefined && field.default !== null) {
      currentVal = field.default;
    }
  }

  // 1. Group layout (horizontal inline fields)
  if (field.type === "group" && Array.isArray(field.fields)) {
    return (
      <div className={`flex gap-2 items-start ${className}`}>
        {field.fields.map((child: any, idx: number) => (
          <ConfigField
            key={child.key || idx}
            field={child}
            model={model}
            defaultProps={defaultProps}
            availableVariables={availableVariables}
            onChange={onChange}
            className="flex-1 min-w-0"
          />
        ))}
      </div>
    );
  }

  // 2. Block layout (dynamic repeatable array of rows)
  if (field.type === "block" && fieldKey) {
    const rawList = model[fieldKey] ?? defaultProps[fieldKey];
    let rows: Array<Record<string, any>> = [];

    if (Array.isArray(rawList)) {
      rows = rawList;
    } else if (fieldKey === "series") {
      // Fallback compatibility for chart series / variables
      if (Array.isArray(model.variables) && model.variables.length > 0) {
        rows = model.variables.map((v: string) => ({ variable: v, label: v }));
      } else if (model.variable) {
        rows = [{ variable: String(model.variable), label: String(model.variable) }];
      }
    }

    const handleAddRow = () => {
      const newRow = buildRow(field.fields || []);
      // If adding series, pick first available variable and distinct color if empty
      if (fieldKey === "series") {
        const CHART_PALETTE = ["#84cc16", "#06b6d4", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#f97316", "#10b981"];
        if (!newRow.color) {
          newRow.color = CHART_PALETTE[rows.length % CHART_PALETTE.length];
        }
        if (!newRow.variable && availableVariables.length > 0) {
          newRow.variable = availableVariables[rows.length % availableVariables.length]?.key || "";
          newRow.label = newRow.variable;
        }
      }
      const next = [...rows, newRow];
      onChange(fieldKey, next);
    };

    const handleRemoveRow = (idx: number) => {
      const next = rows.filter((_, i) => i !== idx);
      onChange(fieldKey, next);
    };

    const handleUpdateRow = (idx: number, childKey: string, childVal: any) => {
      const next = rows.map((r, i) => {
        if (i !== idx) return r;
        return { ...r, [childKey]: childVal };
      });
      onChange(fieldKey, next);
    };

    return (
      <div className={`space-y-2 pt-2 border-t border-border ${className}`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground font-mono uppercase tracking-wider">
            {field.label || fieldKey}
          </label>
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-muted-foreground cursor-pointer"
          >
            <Plus className="size-3" />
            <span>{field.addLabel || "Add"}</span>
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-1 px-0.5">
            No items added yet. Click &quot;{field.addLabel || "Add"}&quot; above.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className="relative p-2.5 rounded-none border border-border bg-muted/50 space-y-2"
              >
                <div className="space-y-2">
                  {(field.fields || []).map((child: any, cIdx: number) => (
                    <ConfigField
                      key={child.key || cIdx}
                      field={child}
                      model={row}
                      defaultProps={{}}
                      availableVariables={availableVariables}
                      onChange={(k, v) => handleUpdateRow(idx, k, v)}
                    />
                  ))}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    title={field.removeLabel || "Remove"}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                  >
                    <Trash2 className="size-3" />
                    <span>{field.removeLabel || "Remove"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 3. Leaf Field Types
  return (
    <div className={`space-y-1 ${className}`}>
      {field.label && field.type !== "boolean" && (
        <label className="text-xs font-medium text-muted-foreground block">
          {field.label}
        </label>
      )}

      {field.type === "variable" ? (
        <Select
          value={currentVal || "__none__"}
          onValueChange={(val) => onChange(fieldKey, val === "__none__" ? "" : val)}
        >
          <SelectTrigger variant="mono" className="w-full">
            <SelectValue placeholder={field.placeholder || "-- Select variable --"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-- None --</SelectItem>
            {availableVariables.map((v) => (
              <SelectItem key={v.key} value={v.key} variant="mono">
                {v.key} {v.unit ? `(${v.unit})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "select" ? (
        <Select
          value={currentVal ? String(currentVal) : undefined}
          onValueChange={(val) => onChange(fieldKey, val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={field.placeholder || "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt: any) => {
              const val = String(typeof opt === "string" ? opt : opt.value);
              const lbl = typeof opt === "string" ? opt : opt.label;
              return (
                <SelectItem key={val} value={val}>
                  {lbl}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      ) : field.type === "boolean" ? (
        <label className="flex items-center justify-between gap-2 cursor-pointer py-1 select-none">
          <span className="text-xs font-medium text-foreground">
            {field.label || fieldKey}
          </span>
          <input
            type="checkbox"
            checked={Boolean(currentVal)}
            onChange={(e) => onChange(fieldKey, e.target.checked)}
            className="size-3.5 rounded-none border-input accent-primary cursor-pointer"
          />
        </label>
      ) : field.type === "multiselect" ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {(field.options || []).map((opt: any) => {
            const val = String(typeof opt === "string" ? opt : opt.value);
            const lbl = typeof opt === "string" ? opt : opt.label;
            const list = Array.isArray(currentVal)
              ? currentVal
              : typeof currentVal === "string"
              ? currentVal.split(",").map((s) => s.trim()).filter(Boolean)
              : [];
            const isSelected = list.includes(val);

            const handleToggle = () => {
              let nextList: string[];
              if (isSelected) {
                nextList = list.filter((item) => item !== val);
              } else {
                const allOpts = (field.options || []).map((o: any) =>
                  String(typeof o === "string" ? o : o.value)
                );
                nextList = allOpts.filter((o: string) => list.includes(o) || o === val);
              }
              onChange(fieldKey, nextList);
            };

            return (
              <button
                key={val}
                type="button"
                onClick={handleToggle}
                className={`px-2 py-1 text-xs font-mono font-medium rounded-sm border transition-all cursor-pointer select-none ${
                  isSelected
                    ? "bg-primary/15 text-primary border-primary font-semibold shadow-2xs"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/50 hover:text-foreground"
                }`}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      ) : field.type === "color" ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            type="color"
            value={currentVal || "#84cc16"}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="size-7.5 shrink-0 rounded-none border border-input cursor-pointer p-0.5 bg-background"
          />
          <input
            type="text"
            value={currentVal || "#84cc16"}
            placeholder="#84cc16"
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="w-full min-w-0 h-7.5 rounded-none border border-input bg-background px-2.5 py-1 text-xs text-foreground outline-none transition focus:border-ring font-mono"
          />
        </div>
      ) : field.type === "number" ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            type="number"
            value={currentVal !== undefined && currentVal !== null ? currentVal : ""}
            placeholder={field.placeholder}
            onChange={(e) => {
              const raw = e.target.value;
              const val = raw === "" ? "" : isNaN(Number(raw)) ? raw : Number(raw);
              onChange(fieldKey, val);
            }}
            className="w-full min-w-0 h-7.5 rounded-none border border-input bg-background px-2.5 py-1 text-xs text-foreground outline-none transition focus:border-ring font-mono"
          />
          {field.suffix && (
            <span className="text-xs font-mono text-muted-foreground shrink-0">
              {field.suffix}
            </span>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={currentVal ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="w-full min-w-0 h-7.5 rounded-none border border-input bg-background px-2.5 py-1 text-xs text-foreground outline-none transition focus:border-ring"
        />
      )}
    </div>
  );
}

export function WidgetConfigPanel({
  item,
  availableVariables = [],
  onUpdate,
  onRemove,
  onDuplicate,
  onClose,
}: {
  item: WidgetInstance | null;
  availableVariables: { key: string; unit?: string }[];
  onUpdate: (updated: WidgetInstance) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClose: () => void;
}) {
  if (!item) return null;

  const manifest = widgets.CATALOG.find((m: any) => m.id === item.type);
  const defaultProps = manifest?.defaultProps || {};

  const handleRootChange = (key: string, val: any) => {
    const patch: Record<string, any> = { [key]: val };

    // Auto-sync unit if variable changed and widget supports unit
    if (key === "variable") {
      const foundVar = availableVariables.find((v) => v.key === val);
      if (foundVar?.unit && !item.props["unit"]) {
        patch["unit"] = foundVar.unit;
      }
    }

    // Handle quirks like swapping dimensions when orientation toggles
    let newW = item.w;
    let newH = item.h;
    if (manifest?.quirks?.swapDimensionsOnPropChange === key) {
      newW = item.h;
      newH = item.w;
    }

    // Sync variables array for iot-chart series
    if (key === "series" && Array.isArray(val)) {
      patch["variables"] = val.map((s: any) => s.variable).filter(Boolean);
    }

    onUpdate({
      ...item,
      w: newW,
      h: newH,
      props: {
        ...item.props,
        ...patch,
      },
    });
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex h-full w-full flex-col bg-card text-card-foreground"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
          Widget config
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Duplicate widget"
            aria-label="Duplicate"
            className="rounded-xs p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            onClick={() => onDuplicate(item.id)}
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete widget"
            aria-label="Delete"
            className="rounded-xs p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            type="button"
            title="Close panel"
            aria-label="Close"
            className="rounded-xs p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto p-3 text-xs">
        <div className="rounded-xs bg-muted px-2.5 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
          <span className="font-semibold text-foreground">
            {manifest?.label || item.type}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
        </div>

        {/* Schema-driven Fields from Manifest */}
        {(manifest?.fields || []).map((f: any, idx: number) => (
          <ConfigField
            key={f.key || idx}
            field={f}
            model={item.props}
            defaultProps={defaultProps}
            availableVariables={availableVariables}
            onChange={handleRootChange}
          />
        ))}
      </div>
    </div>
  );
}


