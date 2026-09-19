import type {
  ConnField,
  ConnOperation,
  ConnSpec,
  IntegrationKind,
} from "./types";
import { CATALOG } from "./specs";

export * from "./types";
export * from "./specs";
export * from "./runtime";
export * from "./lib";

export function connSpec(kind: IntegrationKind): ConnSpec {
  return CATALOG.find((c) => c.kind === kind) ?? CATALOG[0]!;
}

export function connOperations(kind: IntegrationKind): readonly ConnOperation[] {
  return connSpec(kind).operations ?? [];
}

export function operationSpec(kind: IntegrationKind, opKey?: string): ConnOperation | undefined {
  const ops = connOperations(kind);
  return ops.find((o) => o.key === opKey) ?? ops[0];
}

function paramKeys(spec: ConnSpec): ReadonlySet<string> {
  const s = new Set<string>();
  for (const op of spec.operations ?? []) for (const k of op.params) s.add(k);
  return s;
}

export function connectionFields(kind: IntegrationKind): readonly ConnField[] {
  const spec = connSpec(kind);
  const params = paramKeys(spec);
  return spec.fields.filter((f) => !params.has(f.key));
}

export function operationFields(kind: IntegrationKind, opKey?: string): readonly ConnField[] {
  const spec = connSpec(kind);
  const op = operationSpec(kind, opKey);
  if (!op) return [];
  const byKey = new Map(spec.fields.map((f) => [f.key, f]));
  return op.params.map((k) => byKey.get(k)).filter((f): f is ConnField => !!f);
}

export const EXECUTABLE_CONNECTIONS = CATALOG.filter((c) => c.executable);
export const COMING_SOON_CONNECTIONS = CATALOG.filter((c) => !c.executable);

export const INTEGRATION_KINDS = CATALOG.map((c) => c.kind) as [IntegrationKind, ...IntegrationKind[]];
export const VALID_KINDS: ReadonlySet<IntegrationKind> = new Set(INTEGRATION_KINDS);

export function interpolate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function summarize(spec: Pick<ConnSpec, "summary">, config: Record<string, unknown>): string {
  const s = spec.summary;
  if (s.requires && !str(config[s.requires])) return s.fallback ?? "";
  if (s.value !== undefined) return s.value;
  if (s.template !== undefined) {
    const out = fillTemplate(s.template, config);
    return out.trim() ? out : (s.fallback ?? "");
  }
  return s.fallback ?? "";
}

function fillTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)(?::([^{}]*))?\}\}/g, (_, k: string, def?: string) => {
    const v = vars[k];
    const s = v === undefined || v === null ? "" : String(v);
    return s !== "" ? s : (def ?? "");
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
