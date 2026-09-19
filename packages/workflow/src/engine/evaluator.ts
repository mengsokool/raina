export type ComparisonOperator = ">" | "<" | ">=" | "<=" | "==" | "!=" | "changed";

/**
 * Pure evaluator for variable comparisons in triggers and condition blocks.
 */
export function evaluateCondition(
  actual: unknown,
  operator: string,
  target: unknown,
  previousValue?: unknown
): boolean {
  if (operator === "changed") {
    if (previousValue === undefined) return false;
    return String(actual) !== String(previousValue);
  }

  const numActual = Number(actual);
  const numTarget = Number(target);

  // If both sides parse cleanly as numbers, compare numerically
  if (!Number.isNaN(numActual) && !Number.isNaN(numTarget)) {
    switch (operator) {
      case ">":
        return numActual > numTarget;
      case "<":
        return numActual < numTarget;
      case ">=":
        return numActual >= numTarget;
      case "<=":
        return numActual <= numTarget;
      case "==":
        return numActual === numTarget;
      case "!=":
        return numActual !== numTarget;
      default:
        return false;
    }
  }

  // Otherwise compare as strings / values
  const strActual = String(actual ?? "").toLowerCase();
  const strTarget = String(target ?? "").toLowerCase();

  switch (operator) {
    case "==":
      return strActual === strTarget;
    case "!=":
      return strActual !== strTarget;
    case ">":
      return strActual > strTarget;
    case "<":
      return strActual < strTarget;
    case ">=":
      return strActual >= strTarget;
    case "<=":
      return strActual <= strTarget;
    default:
      return false;
  }
}

/**
 * Checks whether the current time falls within a specified time window and weekday set.
 */
export function matchTimeWindow(
  now: Date,
  config: { from?: string; to?: string; days?: number[]; tz?: string }
): boolean {
  const from = config.from || "00:00";
  const to = config.to || "23:59";
  const days = config.days;

  // Weekday check (0 = Sunday, 6 = Saturday)
  if (Array.isArray(days) && days.length > 0) {
    const currentDay = now.getDay();
    if (!days.includes(currentDay)) return false;
  }

  const parseMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = parseMinutes(from);
  const toMinutes = parseMinutes(to);

  if (fromMinutes <= toMinutes) {
    return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
  }
  // Overnight window (e.g. 22:00 to 06:00)
  return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
}
