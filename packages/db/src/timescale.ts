import { prisma } from "./index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const LOCK_ID = 6_184_202_026;

function isEnabled() {
  return process.env.TIMESCALE_ENABLED === "true";
}

function retentionDays() {
  const value = Number(process.env.TELEMETRY_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_RETENTION_DAYS;
}

async function telemetryTableExists() {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.telemetry') IS NOT NULL AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function primaryKeyColumns(client: any) {
  const rows = await client.$queryRaw<Array<{ columns: string[] | null }>>`
    SELECT array_agg(attribute.attname ORDER BY key_column.ordinality) AS columns
    FROM pg_constraint pk_constraint
    JOIN unnest(pk_constraint.conkey) WITH ORDINALITY AS key_column(attnum, ordinality) ON TRUE
    JOIN pg_attribute attribute
      ON attribute.attrelid = pk_constraint.conrelid AND attribute.attnum = key_column.attnum
    WHERE pk_constraint.conrelid = 'public.telemetry'::regclass
      AND pk_constraint.contype = 'p'
  `;
  return rows[0]?.columns ?? [];
}

async function isHypertable(client: any) {
  const rows = await client.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM timescaledb_information.hypertables
      WHERE hypertable_schema = 'public' AND hypertable_name = 'telemetry'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

/**
 * Makes the existing telemetry table a TimescaleDB hypertable without changing
 * Raina's wire format. The time column remains Unix milliseconds (BIGINT), so
 * device payloads, API responses, and existing historical data stay compatible.
 *
 * This is idempotent and guarded by a PostgreSQL advisory lock because API and
 * worker containers may start at the same time.
 */
export async function configureTimescale() {
  if (!isEnabled()) return { enabled: false, configured: false, reason: "disabled" as const };

  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS timescaledb");

  // A brand-new database has no Prisma tables yet. The entrypoint runs this
  // script again after `prisma db push` creates them.
  if (!(await telemetryTableExists())) {
    return { enabled: true, configured: false, reason: "schema-pending" as const };
  }

  return prisma.$transaction(async (tx) => {
    // Transaction-scoped advisory locking keeps the migration serial even when
    // an API replica and a worker begin booting concurrently.
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);

    if (!(await isHypertable(tx))) {
      const columns = await primaryKeyColumns(tx);
      if (columns.join(",") !== "id,timestamp") {
        // No Raina table references telemetry rows, so changing this key does
        // not invalidate application foreign keys. This is required before a
        // hypertable can be created because its time partition must be part of
        // every unique constraint.
        await tx.$executeRawUnsafe('ALTER TABLE "telemetry" DROP CONSTRAINT IF EXISTS "telemetry_pkey"');
        await tx.$executeRawUnsafe('ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id", "timestamp")');
      }

      // Existing foreign keys require locks on their referenced tables while
      // Timescale migrates the already-written rows into chunks.
      await tx.$executeRawUnsafe('LOCK TABLE "projects", "devices" IN SHARE ROW EXCLUSIVE MODE');
      await tx.$executeRawUnsafe(
        "SELECT create_hypertable('telemetry', by_range('timestamp', 86400000::bigint), migrate_data => TRUE, if_not_exists => TRUE)"
      );
    }

    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.raina_telemetry_now()
      RETURNS BIGINT
      LANGUAGE SQL
      STABLE
      AS $$ SELECT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT $$
    `);
    await tx.$executeRawUnsafe(
      "SELECT set_integer_now_func('telemetry', 'raina_telemetry_now', replace_if_exists => TRUE)"
    );

    const days = retentionDays();
    if (days > 0) {
      await tx.$executeRawUnsafe(
        `SELECT add_retention_policy('telemetry', ${(days * DAY_MS).toString()}::BIGINT, if_not_exists => TRUE)`
      );
    }

    return { enabled: true, configured: true, reason: "ready" as const };
  });
}

async function main() {
  const result = await configureTimescale();
  console.log(`[Timescale] ${result.reason}`);
}

main()
  .catch((error) => {
    console.error("[Timescale] setup failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
