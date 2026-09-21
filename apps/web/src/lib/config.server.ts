import { z } from "zod";

const serverEnvSchema = z.object({
  INTERNAL_API_URL: z.string().url().default("http://127.0.0.1:3001"),
  PORT: z.preprocess((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.trim() !== "") {
      const num = Number(val);
      if (!Number.isNaN(num)) return num;
    }
    return 3000;
  }, z.number().int()).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const serverConfig = {
  get internalApiUrl(): string {
    return process.env.INTERNAL_API_URL || "http://127.0.0.1:3001";
  },
  get port(): number {
    return Number(process.env.PORT) || 3000;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};

export function validateWebServerConfig() {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[Web Config Error]:", result.error.format());
    throw new Error(`Invalid web server configuration: ${result.error.message}`);
  }
  return result.data;
}
