import { prisma } from "@raina/db";
import { executeAutomation } from "./engine";

/**
 * Runs evaluation of active automations when a variable is updated via telemetry.
 */
export async function evaluateVariableAutomations(
  projectId: string,
  variableKey: string,
  currentValue: unknown,
  deviceId?: string,
  depth: number = 0
) {
  try {
    const automations = await prisma.automation.findMany({
      where: {
        projectId,
        enabled: true,
      },
    });

    const now = Date.now();
    for (const auto of automations) {
      void executeAutomation(auto, {
        source: "telemetry",
        projectId,
        variable: variableKey,
        value: currentValue,
        deviceId,
        ts: now,
        depth,
      });
    }
  } catch (err) {
    console.error("[Automation Evaluator Error]:", err);
  }
}
