import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConnField } from "@raina/workflow";

export interface IntegrationFieldInputProps {
  field: ConnField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function IntegrationFieldInput({
  field,
  value,
  onChange,
  disabled = false,
}: IntegrationFieldInputProps) {
  const baseInputClass =
    "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

  if (field.type === "select") {
    const currentVal = value !== undefined && value !== null && value !== ""
      ? String(value)
      : field.default || "";

    return (
      <Select
        value={currentVal}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full bg-white text-xs dark:bg-neutral-950">
          <SelectValue placeholder={field.placeholder || "Select option"} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        step="any"
        disabled={disabled}
        value={value !== undefined && value !== null ? String(value) : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        placeholder={field.placeholder}
        className={baseInputClass}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-neutral-300 text-accent-600 focus:ring-accent-500 dark:border-neutral-700"
        />
        <span className="text-neutral-600 dark:text-neutral-400">
          {field.label}
        </span>
      </label>
    );
  }

  if (field.type === "textarea" || field.type === "json") {
    return (
      <textarea
        rows={field.type === "json" ? 4 : 3}
        disabled={disabled}
        value={typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={`${baseInputClass} font-mono text-xs`}
      />
    );
  }

  if (field.type === "code") {
    return (
      <textarea
        rows={6}
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50"
      />
    );
  }

  return (
    <input
      type={field.type === "url" ? "url" : "text"}
      disabled={disabled}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={`${baseInputClass} ${field.mono ? "font-mono" : ""}`}
    />
  );
}
