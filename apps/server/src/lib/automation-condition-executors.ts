import type { GraphNode } from "@raina/workflow";
import type { AutomationContext } from "./engine";

type ConditionExecutorInput = {
  config: Record<string, unknown>;
  context: AutomationContext;
  projectId: string;
  evaluateOperator: (current: unknown, operator: string, target: unknown) => boolean;
  readVariable: (key: string) => Promise<unknown>;
  isTimeInWindow: (config: Record<string, unknown>) => boolean;
};

type ConditionExecutor = (input: ConditionExecutorInput) => Promise<boolean> | boolean;

const ifVariable: ConditionExecutor = async ({ config, context, evaluateOperator, readVariable }) => {
  const variable = String(config.variable || "");
  const operator = String(config.operator || "==");
  const target = config.value;
  const current = context.variable === variable ? context.value : await readVariable(variable);
  return evaluateOperator(current, operator, target);
};

const timeWindow: ConditionExecutor = ({ config, isTimeInWindow }) => isTimeInWindow(config);

export const CONDITION_EXECUTORS: Readonly<Record<string, ConditionExecutor>> = {
  if_variable: ifVariable,
  time_window: timeWindow,
};

export async function executeCondition(
  node: Pick<GraphNode, "kind" | "config">,
  input: Omit<ConditionExecutorInput, "config">
): Promise<boolean> {
  const executor = CONDITION_EXECUTORS[node.kind];
  return executor ? executor({ ...input, config: node.config || {} }) : true;
}
