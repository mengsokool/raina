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
    "w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

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
        <SelectTrigger className="w-full">
          <SelectValue placeholder={field.placeholder || "Select option"} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={opt} value={opt}>
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
          className="rounded border-input text-primary focus:ring-ring"
        />
        <span className="text-muted-foreground">
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
        className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
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
