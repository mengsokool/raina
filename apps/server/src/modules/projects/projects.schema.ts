import { z } from "zod";

export const projectInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const projectUpdateInputSchema = projectInputSchema.partial();

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export function toProjectResponse(project: {
  id: string;
  name: string;
  description: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    created_at: Number(project.createdAt),
    updated_at: Number(project.updatedAt),
  };
}
