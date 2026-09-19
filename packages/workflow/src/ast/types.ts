import { z } from "zod";

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  x: z.number().optional(),
  y: z.number().optional(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  port: z.string().optional(),
});

export type GraphEdge = {
  from: string;
  to: string;
  port?: string;
};

export const AutomationGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export type AutomationGraph = z.infer<typeof AutomationGraphSchema>;

export type AutomationTriggerType =
  | "variable"
  | "manual"
  | "schedule"
  | "sunset_sunrise"
  | "event";

export type Automation = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: AutomationTriggerType;
  trigger_config: unknown;
  actions: unknown[];
  graph: AutomationGraph | null;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
  last_run_status: "ok" | "error" | "skipped" | null;
  last_error: string | null;
};

