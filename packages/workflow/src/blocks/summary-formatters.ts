import type { BlockSummaryResolvers } from "./types";

const OP: Record<string, string> = { ">": ">", "<": "<", ">=": "≥", "<=": "≤", "==": "=", "!=": "≠" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const text = (value: unknown): string =>
  value === undefined || value === null || value === "" ? "" : String(value);

export const operator = (value: unknown): string => OP[text(value)] ?? text(value);

export const variable = (value: unknown, resolvers: BlockSummaryResolvers): string =>
  (resolvers.variableLabel ?? ((key: string) => key))(text(value)) || "?";

export const days = (value: unknown, empty = "every day"): string => {
  const selected = Array.isArray(value) ? value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : [];
  return selected.length === 0 ? empty : selected.slice().sort().map((day) => DAYS[day]).join(" ");
};
