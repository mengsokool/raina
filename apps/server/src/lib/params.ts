import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

/**
 * Common Zod schemas for route parameters.
 */
export const projParamSchema = z.object({
  proj: z.string().min(1, "Project identifier is required"),
});

export const idParamSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

export const projIdParamSchema = z.object({
  proj: z.string().min(1, "Project identifier is required"),
  id: z.string().min(1, "ID is required"),
});

export const projKeyParamSchema = z.object({
  proj: z.string().min(1, "Project identifier is required"),
  key: z.string().min(1, "Variable key is required"),
});

/**
 * Safely extracts a required route parameter.
 * Throws an HTTPException(400) if the parameter is missing or empty.
 * Returns a guaranteed non-empty string with zero type assertions.
 */
export function getRequiredParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new HTTPException(400, {
      message: `Missing or invalid required route parameter: ${name}`,
    });
  }
  return value;
}
