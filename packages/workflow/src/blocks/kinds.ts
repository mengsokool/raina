import { TRIGGER_CATALOG } from "./triggers";
import { ACTION_CATALOG } from "./actions";
import { CONDITION_CATALOG } from "./conditions";

export type TriggerKind = (typeof TRIGGER_CATALOG)[number]["kind"];
export type ActionKind = (typeof ACTION_CATALOG)[number]["kind"];
export type ConditionKind = (typeof CONDITION_CATALOG)[number]["kind"];
export type BlockKind = TriggerKind | ActionKind | ConditionKind;

export const TRIGGER_KINDS = TRIGGER_CATALOG.map((t) => t.kind) as [TriggerKind, ...TriggerKind[]];
export const ACTION_KINDS = ACTION_CATALOG.map((a) => a.kind) as [ActionKind, ...ActionKind[]];
export const CONDITION_KINDS = CONDITION_CATALOG.map((c) => c.kind) as [ConditionKind, ...ConditionKind[]];

export const VALID_TRIGGER_KINDS: ReadonlySet<string> = new Set(TRIGGER_KINDS);
export const VALID_ACTION_KINDS: ReadonlySet<string> = new Set(ACTION_KINDS);
export const VALID_CONDITION_KINDS: ReadonlySet<string> = new Set(CONDITION_KINDS);
