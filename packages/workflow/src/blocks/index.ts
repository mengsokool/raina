import { TRIGGER_CATALOG } from "./triggers";
import { ACTION_CATALOG } from "./actions";
import { CONDITION_CATALOG } from "./conditions";
import type { BlockManifest } from "./types";

export type { BlockCategory, BlockFieldType, BlockField, BlockPorts, BlockManifest } from "./types";
export { TRIGGER_CATALOG } from "./triggers";
export { ACTION_CATALOG } from "./actions";
export { CONDITION_CATALOG } from "./conditions";
export * from "./summary";
export * from "../ast/index";

export * from "./kinds";

export const BLOCK_CATALOG = [
  ...TRIGGER_CATALOG,
  ...CONDITION_CATALOG,
  ...ACTION_CATALOG,
] as const satisfies readonly BlockManifest[];

export const BLOCK_REGISTRY = Object.fromEntries(
  BLOCK_CATALOG.map((block) => [block.kind, block])
) as Record<string, BlockManifest>;

export function triggerSpec(kind: string): BlockManifest {
  return TRIGGER_CATALOG.find((t) => t.kind === kind) ?? TRIGGER_CATALOG[0];
}

export function actionSpec(kind: string): BlockManifest {
  return ACTION_CATALOG.find((a) => a.kind === kind) ?? ACTION_CATALOG[0];
}

export function findBlock(kind: string): BlockManifest | undefined {
  return BLOCK_REGISTRY[kind];
}
