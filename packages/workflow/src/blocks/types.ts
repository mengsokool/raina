export type BlockCategory = "trigger" | "condition" | "action";

export type BlockFieldType =
  | "text"
  | "textarea"
  | "json"
  | "select"
  | "number"
  | "boolean"
  | "variable"
  | "device"
  | "integration"
  | "time"
  | "weekdays";

export type BlockField = {
  key: string;
  label: string;
  type: BlockFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  options?: readonly string[];
  default?: string | number | boolean;
};

export type BlockPorts = {
  in?: readonly string[];
  out?: readonly string[];
};

export type BlockSummaryResolvers = {
  variableLabel?: (key: string) => string;
  integration?: (id: string) => { name: string; kindLabel?: string; icon?: string } | undefined;
};

import type { SummaryDescriptor } from "../integrations/types";
export type { SummaryDescriptor };

export type BlockManifest = {
  kind: string;
  category: BlockCategory;
  label: string;
  description: string;
  icon: string;
  executable: boolean;
  ports: BlockPorts;
  fields: readonly BlockField[];
  summary?: SummaryDescriptor;
  summarize?: (config: Record<string, unknown>, resolvers: BlockSummaryResolvers) => string[];
};
