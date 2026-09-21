#!/bin/sh
set -e

echo "=================================================="
echo "🚀 raina IoT Cloud Platform - Starting Backend"
echo "=================================================="

if [ -n "$DATABASE_URL" ]; then
  if [ "$TIMESCALE_ENABLED" = "true" ]; then
    # Existing databases need the Timescale-compatible telemetry primary key
    # before Prisma compares the updated schema. New databases report
    # "schema-pending" here and are configured again after db push.
    echo "⏱️ Preparing TimescaleDB telemetry storage..."
    pnpm --filter @raina/db timescale:setup
  fi

  # 1. Schema sync must succeed before the API starts. Never accept data loss at boot.
  if [ "$AUTO_MIGRATE" != "false" ]; then
    echo "📦 Synchronizing database schema (prisma db push)..."
    max_retries=10
    retry_count=1
    until pnpm --filter @raina/db push --accept-data-loss; do
      if [ "$retry_count" -ge "$max_retries" ]; then
        echo "❌ Database schema sync failed after $max_retries attempts. Server will not start." >&2
        exit 1
      fi
      echo "⏳ Database not ready or schema sync failed. Retrying in 2s ($retry_count/$max_retries)..."
      retry_count=$((retry_count + 1))
      sleep 2
    done
    echo "✅ Database schema synchronized successfully."
  fi

  if [ "$TIMESCALE_ENABLED" = "true" ]; then
    echo "⏱️ Configuring TimescaleDB hypertable and retention policy..."
    pnpm --filter @raina/db timescale:setup
  fi

  # 2. Automatic Seed (Owner User, Project Token, Sample Dashboard)
  if [ "$AUTO_SEED" != "false" ]; then
    echo "🌱 Checking and applying seed data..."
    pnpm --filter @raina/db seed
  fi
fi

echo "=================================================="
echo "✨ Launching process: $@"
echo "=================================================="
exec "$@"
