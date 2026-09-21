import { Prisma } from "@prisma/client";
import { prisma } from "@raina/db";

export type DashboardSeries = Record<string, { t: number[]; v: number[] }>;

/**
 * Gets the latest points for every requested variable in one query. The window
 * function preserves the per-variable 300 point limit without N+1 queries.
 */
export async function loadDashboardSeries(projectId: string, variableKeys: string[]): Promise<DashboardSeries> {
  if (variableKeys.length === 0) return {};
  // Test adapters and lightweight Prisma doubles may not implement raw SQL.
  // Production PostgreSQL always takes the single-query path below.
  if (typeof (prisma as any).$queryRaw !== "function") {
    const series: DashboardSeries = {};
    await Promise.all(variableKeys.map(async (key) => {
      const rows = await prisma.telemetry.findMany({ where: { projectId, variableKey: key }, orderBy: { timestamp: "desc" }, take: 300 });
      rows.reverse();
      series[key] = { t: rows.map((row) => Number(row.timestamp)), v: rows.map((row) => row.value) };
    }));
    return series;
  }
  const rows = await prisma.$queryRaw<Array<{ variable_key: string; timestamp: bigint; value: number }>>`
    SELECT variable_key, timestamp, value
    FROM (
      SELECT variable_key, timestamp, value,
        ROW_NUMBER() OVER (PARTITION BY variable_key ORDER BY timestamp DESC) AS row_number
      FROM telemetry
      WHERE project_id = ${projectId}
        AND variable_key IN (${Prisma.join(variableKeys)})
    ) latest
    WHERE row_number <= 300
    ORDER BY variable_key ASC, timestamp ASC
  `;
  const series: DashboardSeries = Object.fromEntries(variableKeys.map((key) => [key, { t: [], v: [] }]));
  for (const row of rows) {
    const target = series[row.variable_key];
    if (target) {
      target.t.push(Number(row.timestamp));
      target.v.push(row.value);
    }
  }
  return series;
}
