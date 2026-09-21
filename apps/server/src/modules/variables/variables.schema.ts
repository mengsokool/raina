import { z } from "zod";

export const createVariableInputSchema = z.object({
  key: z.string().min(1, "Variable key is required"),
  unit: z.string().optional(),
  defaultValue: z.string().optional(),
  rlp_channel: z.number().int().min(1).max(65535).optional(),
});

export const patchVariableInputSchema = z.object({
  unit: z.string().optional(),
  rlp_channel: z.number().int().min(1).max(65535).nullable().optional(),
});

export type CreateVariableInput = z.infer<typeof createVariableInputSchema>;
export type PatchVariableInput = z.infer<typeof patchVariableInputSchema>;

export interface VariableResponse {
  id: string;
  key: string;
  unit: string | null;
  value: string | null;
  created_at: number;
  updated_at: number;
  last_seen: number | null;
  rlp_channel: number | null;
}

export function toVariableResponse(v: {
  id: string;
  key: string;
  unit: string | null;
  value: string | null;
  createdAt: bigint;
  updatedAt: bigint;
  lastSeen: bigint | null;
  rlpChannel: number | null;
}): VariableResponse {
  return {
    id: v.id,
    key: v.key,
    unit: v.unit,
    value: v.value,
    created_at: Number(v.createdAt),
    updated_at: Number(v.updatedAt),
    last_seen: v.lastSeen ? Number(v.lastSeen) : null,
    rlp_channel: v.rlpChannel,
  };
}
