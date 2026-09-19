export * from "./evaluator";

export interface AutomationContext {
  source: "telemetry" | "event" | "schedule" | "manual" | "delay_resume" | "control";
  projectId: string;
  ts: number;
  variable?: string;
  value?: unknown;
  deviceId?: string;
  event?: string;
  payload?: Record<string, unknown>;
  isManual?: boolean;
  depth?: number;
}

export interface StepLog {
  nodeId: string;
  nodeKind: string;
  category: "trigger" | "condition" | "action";
  status: "ok" | "failed" | "skipped" | "paused";
  detail?: string;
  output?: unknown;
  retryCount?: number;
  durationMs: number;
}

export interface AutomationExecutionResult {
  runId?: string;
  automationId: string;
  status: "ok" | "error" | "skipped" | "paused";
  stepsExecuted: number;
  logs: StepLog[];
  error?: string;
}
