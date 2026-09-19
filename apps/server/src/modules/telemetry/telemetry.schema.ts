import { z } from "zod";

export const controlInputSchema = z.object({
  projectId: z.string().optional(),
  project_id: z.string().optional(),
  deviceId: z.string().optional(),
  device_id: z.string().optional(),
  variableKey: z.string().optional(),
  variable: z.string().optional(),
  key: z.string().optional(),
  value: z.unknown(),
});

export type ControlInput = z.infer<typeof controlInputSchema>;

export interface TelemetryHistoryResult {
  projectId: string;
  variable: string;
  points: number;
  series: {
    t: number[];
    v: number[];
  };
}
