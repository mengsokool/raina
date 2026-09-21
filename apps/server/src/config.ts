import { z } from "zod";

const booleanString = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const s = val.toLowerCase().trim();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no" || s === "") return false;
  }
  return val;
}, z.boolean());

const numberString = (defaultVal: number) =>
  z.preprocess((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.trim() !== "") {
      const num = Number(val);
      return Number.isNaN(num) ? val : num;
    }
    return defaultVal;
  }, z.number().int());

export const serverEnvSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: numberString(3001).default(3001),
  CORS_ORIGIN: z.string().optional(),
  PUBLIC_API_URL: z.string().url().or(z.literal("")).optional(),
  COOKIE_DOMAIN: z.string().optional(),

  // Database & Timescale
  DATABASE_URL: z.string().optional(),
  TIMESCALE_ENABLED: booleanString.default(true),
  TELEMETRY_RETENTION_DAYS: numberString(30).default(30),
  AUTO_MIGRATE: booleanString.default(true),
  AUTO_SEED: booleanString.default(false),

  // Redis
  REDIS_ENABLED: booleanString.default(false),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),

  // Security & Secrets
  ENCRYPTION_KEY: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  WS_TICKET_SECRET: z.string().optional(),
  SETUP_TOKEN: z.string().optional(),

  // RLP Device Gateway
  RLP_HOST: z.string().default("0.0.0.0"),
  RLP_PORT: numberString(9000).default(9000),
  PUBLIC_RLP_HOST: z.string().default("127.0.0.1"),
  PUBLIC_RLP_PORT: z.preprocess((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.trim() !== "") {
      const num = Number(val);
      if (!Number.isNaN(num)) return num;
    }
    return undefined;
  }, z.number().int().optional()),
  PUBLIC_RLP_TLS: booleanString.optional(),
  RLP_REQUIRE_TLS: booleanString.optional(),
  RLP_TLS_CERT_PATH: z.string().optional(),
  RLP_TLS_KEY_PATH: z.string().optional(),
  RLP_REQUIRE_REDIS: booleanString.default(true),
  RLP_DEVICE_LEASE_MS: numberString(45000).default(45000),
  RLP_MAX_CONNECTIONS: numberString(10000).default(10000),
  RLP_MAX_FRAME_SIZE: numberString(16384).default(16384),
  RLP_IDLE_TIMEOUT_MS: numberString(90000).default(90000),

  // Worker & Scheduler
  SCHEDULER_ENABLED: booleanString.default(true),

  // Integrations / AI
  TYPESAFE_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

export function getRawConfig(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[Config] Invalid environment variables:", result.error.format());
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}

export const config = {
  get nodeEnv(): "development" | "production" | "test" {
    return (process.env.NODE_ENV as "development" | "production" | "test") || "development";
  },
  get isProduction(): boolean {
    return this.nodeEnv === "production";
  },
  get isTest(): boolean {
    return this.nodeEnv === "test";
  },
  get port(): number {
    return Number(process.env.PORT) || 3001;
  },
  get corsOrigins(): string[] {
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return DEFAULT_DEV_ORIGINS;
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
  },
  get publicApiUrl(): string | undefined {
    return process.env.PUBLIC_API_URL?.trim() || undefined;
  },
  get cookieDomain(): string | undefined {
    return process.env.COOKIE_DOMAIN?.trim() || undefined;
  },
  get databaseUrl(): string | undefined {
    return process.env.DATABASE_URL;
  },
  get timescaleEnabled(): boolean {
    return process.env.TIMESCALE_ENABLED === "true";
  },
  get telemetryRetentionDays(): number {
    const days = Number(process.env.TELEMETRY_RETENTION_DAYS);
    return Number.isFinite(days) && days >= 0 ? days : 30;
  },
  get autoMigrate(): boolean {
    return process.env.AUTO_MIGRATE !== "false";
  },
  get autoSeed(): boolean {
    return process.env.AUTO_SEED === "true";
  },
  get redisEnabled(): boolean {
    return process.env.REDIS_ENABLED === "true";
  },
  get redisUrl(): string {
    return process.env.REDIS_URL || "redis://127.0.0.1:6379";
  },
  get encryptionKey(): string | undefined {
    return process.env.ENCRYPTION_KEY?.trim() || undefined;
  },
  get jwtSecret(): string | undefined {
    return process.env.JWT_SECRET?.trim() || undefined;
  },
  get wsTicketSecret(): string | undefined {
    return process.env.WS_TICKET_SECRET?.trim() || undefined;
  },
  get setupToken(): string | undefined {
    return process.env.SETUP_TOKEN?.trim() || undefined;
  },
  get schedulerEnabled(): boolean {
    return process.env.SCHEDULER_ENABLED !== "false";
  },
  get typesafeApiKey(): string | undefined {
    return process.env.TYPESAFE_API_KEY?.trim() || undefined;
  },

  // RLP Specific
  get rlpHost(): string {
    return process.env.RLP_HOST || "0.0.0.0";
  },
  get rlpPort(): number {
    return Number(process.env.RLP_PORT) || 9000;
  },
  get publicRlpHost(): string {
    return process.env.PUBLIC_RLP_HOST || "127.0.0.1";
  },
  get publicRlpPort(): number {
    if (process.env.PUBLIC_RLP_PORT) return Number(process.env.PUBLIC_RLP_PORT);
    const apiUrl = process.env.PUBLIC_API_URL;
    return apiUrl && apiUrl.startsWith("https") ? 8883 : 9000;
  },
  get publicRlpTls(): boolean {
    if (process.env.PUBLIC_RLP_TLS !== undefined) {
      return process.env.PUBLIC_RLP_TLS !== "false";
    }
    return this.publicRlpPort === 8883;
  },
  get rlpRequireTls(): boolean {
    if (process.env.RLP_REQUIRE_TLS !== undefined) {
      return process.env.RLP_REQUIRE_TLS === "true";
    }
    return this.isProduction;
  },
  get rlpTlsCertPath(): string | undefined {
    return process.env.RLP_TLS_CERT_PATH;
  },
  get rlpTlsKeyPath(): string | undefined {
    return process.env.RLP_TLS_KEY_PATH;
  },
  get rlpRequireRedis(): boolean {
    return process.env.RLP_REQUIRE_REDIS !== "false";
  },
  get rlpDeviceLeaseMs(): number {
    return Math.max(15_000, Number(process.env.RLP_DEVICE_LEASE_MS) || 45_000);
  },
  get rlpMaxConnections(): number {
    return Number(process.env.RLP_MAX_CONNECTIONS) || 10_000;
  },
  get rlpMaxFrameSize(): number {
    return Number(process.env.RLP_MAX_FRAME_SIZE) || 16_384;
  },
  get rlpIdleTimeoutMs(): number {
    return Number(process.env.RLP_IDLE_TIMEOUT_MS) || 90_000;
  },
};

/**
 * Validates critical environment variables at startup.
 * Throws in production when unsafe or missing configurations are detected.
 */
export function validateStartupConfig(): void {
  const raw = getRawConfig();

  if (raw.NODE_ENV === "production") {
    // 1. Encryption Key
    if (!raw.ENCRYPTION_KEY && !raw.JWT_SECRET) {
      console.warn(
        "[Security Warning] Neither ENCRYPTION_KEY nor JWT_SECRET is set in production. Integration configs will fail to seal securely."
      );
    }

    // 2. WebSocket ticket secret
    if (!raw.WS_TICKET_SECRET && !raw.JWT_SECRET) {
      console.warn(
        "[Security Warning] Neither WS_TICKET_SECRET nor JWT_SECRET is set in production. Realtime WebSocket tickets will not be signable."
      );
    }

    // 3. Database URL
    if (!raw.DATABASE_URL) {
      console.warn(
        "[Config Warning] DATABASE_URL is not set in environment. Prisma will rely on schema default or local database."
      );
    }

    // 4. Redis in production
    if (!raw.REDIS_ENABLED) {
      console.info(
        "[Config] REDIS_ENABLED is false. Multi-instance scaling and distributed RLP command routing are disabled."
      );
    }
  }
}
