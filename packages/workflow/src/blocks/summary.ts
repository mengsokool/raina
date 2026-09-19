import { findBlock } from "./index";
import type { BlockSummaryResolvers } from "./types";

export type SummaryResolvers = BlockSummaryResolvers;

export function blockLines(kind: string, config: Record<string, unknown>, r: SummaryResolvers = {}): string[] {
  return findBlock(kind)?.summarize?.(config ?? {}, r).filter(Boolean) ?? [];
}

export function blockChip(kind: string, config: Record<string, unknown>, r: SummaryResolvers = {}): { icon: string; label: string } {
  const manifest = findBlock(kind);
  const lines = blockLines(kind, config, r);
  let icon = manifest?.icon ?? "";
  if (kind === "call_integration") {
    const i = r.integration?.(String((config ?? {})["integration_id"] ?? ""));
    if (i?.icon) icon = i.icon;
  }
  return { icon, label: lines[0] || manifest?.label || kind };
}
