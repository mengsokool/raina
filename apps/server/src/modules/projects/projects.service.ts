import { prisma } from "@raina/db";
import { nanoid } from "nanoid";
import type { AuthUser } from "../../lib/auth";
import {
  type ProjectInput,
  type ProjectUpdateInput,
  toProjectResponse,
  type ProjectResponse,
} from "./projects.schema";

export class ProjectService {
  async listProjects(user: AuthUser): Promise<ProjectResponse[]> {
    if (user.role === "client") {
      const memberships = await prisma.projectMember.findMany({
        where: { userId: user.id },
        include: { project: true },
      });
      return memberships
        .map((m) => m.project)
        .filter((p) => p && p.archivedAt === null)
        .map(toProjectResponse);
    }

    const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return projects.map(toProjectResponse);
  }

  async getProjectById(projId: string): Promise<ProjectResponse | null> {
    const project = await prisma.project.findUnique({
      where: { id: projId },
    });
    if (!project || project.archivedAt !== null) return null;
    return toProjectResponse(project);
  }

  async createProject(input: ProjectInput): Promise<ProjectResponse> {
    const now = BigInt(Date.now());
    const project = await prisma.project.create({
      data: {
        id: `prj_${nanoid(10)}`,
        name: input.name,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Automatically provision default virtual device for initial onboarding
    await prisma.device.create({
      data: {
        id: `dev_${nanoid(10)}`,
        projectId: project.id,
        name: "Default Device",
        isDefault: true,
        createdAt: now,
      },
    });

    return toProjectResponse(project);
  }

  async updateProject(projId: string, input: ProjectUpdateInput): Promise<ProjectResponse> {
    const updated = await prisma.project.update({
      where: { id: projId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedAt: BigInt(Date.now()),
      },
    });
    return toProjectResponse(updated);
  }

  async archiveProject(projId: string): Promise<boolean> {
    await prisma.project.update({
      where: { id: projId },
      data: { archivedAt: BigInt(Date.now()) },
    });
    return true;
  }
}

export const projectService = new ProjectService();
