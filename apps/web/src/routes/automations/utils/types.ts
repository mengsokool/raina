import { z } from "zod";
import { blocks } from "@raina/workflow";

export type Variable = { id: string; key: string; unit?: string | null };
export type Device = { id: string; name: string };
export type Integration = { id: string; name: string; kind: string; enabled: boolean };

export type BlockData = {
  kind: string;
  config: Record<string, unknown>;
  errors?: Record<string, string>;
};

export type Notice = {
  kind: "error" | "success" | "info";
  message: string;
} | null;

export const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;

export function validateBlockConfig(kind: string, config: Record<string, unknown>): Record<string, string> {
  const manifest = blocks.findBlock(kind);
  if (!manifest) return {};

  const errors: Record<string, string> = {};

  for (const field of manifest.fields) {
    const value = config[field.key];
    const isMissing = value === undefined || value === null || value === "";

    if (field.required && isMissing) {
      errors[field.key] = `${field.label} is required`;
      continue;
    }

    if (isMissing) continue;

    if (field.type === "number") {
      const num = Number(value);
      if (typeof value !== "number" && isNaN(num)) {
        errors[field.key] = `${field.label} must be a valid number`;
      }
    } else if (field.type === "time") {
      if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        errors[field.key] = `${field.label} must use 24h format (HH:MM)`;
      }
    } else if (field.type === "weekdays") {
      if (!Array.isArray(value) || value.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        errors[field.key] = `${field.label} contains an invalid day`;
      }
    } else if (field.type === "select" && field.options) {
      if (typeof value !== "string" || !field.options.includes(value)) {
        errors[field.key] = `Invalid selection for ${field.label}`;
      }
    }
  }

  return errors;
}

export function validateAllBlocks(nodes: Array<{ id: string; data: BlockData }>): Map<string, Record<string, string>> {
  const result = new Map<string, Record<string, string>>();
  for (const node of nodes) {
    const errs = validateBlockConfig(node.data.kind, node.data.config);
    if (Object.keys(errs).length > 0) {
      result.set(node.id, errs);
    }
  }
  return result;
}
