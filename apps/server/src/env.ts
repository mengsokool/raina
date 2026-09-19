import { Context, Hono } from "hono";
import type { AuthUser } from "./lib/auth";

export interface AppEnv {
  Variables: {
    user: AuthUser;
    userId: string;
    deviceTokenId?: string;
    projectId?: string;
  };
}

export type AppContext = Context<AppEnv>;

/**
 * Creates a strongly-typed Hono sub-router with AppEnv context variables.
 */
export function createRouter() {
  return new Hono<AppEnv>();
}
