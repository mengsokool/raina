import { prisma } from "@raina/db";
import { getOrCreateDefaultDevice } from "../../services/telemetry.service";
import {
  type CreateVariableInput,
  type PatchVariableInput,
  toVariableResponse,
  type VariableResponse,
} from "./variables.schema";

export class VariableService {
  async listVariables(projId: string): Promise<VariableResponse[]> {
    const variables = await prisma.projectVariable.findMany({
      where: { projectId: projId },
      orderBy: { key: "asc" },
    });
    return variables.map(toVariableResponse);
  }

  async createVariable(projId: string, input: CreateVariableInput): Promise<{ id: string; key: string; unit: string | null; value: string | null }> {
    const now = BigInt(Date.now());
    const devId = await getOrCreateDefaultDevice(projId);
    const v = await prisma.projectVariable.upsert({
      where: { projectId_key: { projectId: projId, key: input.key } },
      update: { unit: input.unit ?? null, rlpChannel: input.rlp_channel, updatedAt: now },
      create: {
        id: `var_${projId}_${input.key}`,
        projectId: projId,
        deviceId: devId,
        key: input.key,
        unit: input.unit ?? null,
        value: input.defaultValue ? String(input.defaultValue) : null,
        rlpChannel: input.rlp_channel ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return { id: v.id, key: v.key, unit: v.unit, value: v.value };
  }

  async patchVariable(projId: string, idOrKey: string, input: PatchVariableInput): Promise<VariableResponse | null> {
    const now = BigInt(Date.now());
    const variable = await prisma.projectVariable.findFirst({
      where: { projectId: projId, OR: [{ id: idOrKey }, { key: idOrKey }] },
    });
    if (!variable) return null;
    const updated = await prisma.projectVariable.update({
      where: { id: variable.id },
      data: { unit: input.unit, rlpChannel: input.rlp_channel, updatedAt: now },
    });
    return toVariableResponse(updated);
  }

  async deleteVariable(projId: string, idOrKey: string): Promise<{ id: string; key: string } | null> {
    const v = await prisma.projectVariable.findFirst({
      where: { projectId: projId, OR: [{ id: idOrKey }, { key: idOrKey }] },
    });
    if (!v) return null;
    await prisma.projectVariable.delete({ where: { id: v.id } });
    return { id: v.id, key: v.key };
  }

  async getProjectState(projId: string) {
    const variables = await prisma.projectVariable.findMany({ where: { projectId: projId } });
    const varMap: Record<string, { value: unknown; received_at: number }> = {};
    for (const v of variables) {
      let parsedVal: unknown = v.value;
      if (v.value !== null && v.value !== undefined) {
        const num = Number(v.value);
        parsedVal = isNaN(num) ? v.value : num;
      }
      varMap[v.key] = { value: parsedVal, received_at: Number(v.lastSeen || v.updatedAt) };
    }
    const series: Record<string, { t: number[]; v: number[] }> = {};
    await Promise.all(
      variables.map(async (v) => {
        const rows = await prisma.telemetry.findMany({
          where: { projectId: projId, variableKey: v.key },
          orderBy: { timestamp: "desc" },
          take: 300,
        });
        const tArr: number[] = [];
        const vArr: number[] = [];
        for (let i = rows.length - 1; i >= 0; i--) {
          tArr.push(Number(rows[i].timestamp));
          vArr.push(rows[i].value);
        }
        series[v.key] = { t: tArr, v: vArr };
      })
    );
    return { variables: varMap, series };
  }

  async getVariableSeries(projId: string, key: string) {
    const telemetry = await prisma.telemetry.findMany({
      where: { projectId: projId, variableKey: key },
      orderBy: { timestamp: "desc" },
      take: 300,
    });
    const t: number[] = [];
    const v: number[] = [];
    for (const row of telemetry.reverse()) {
      t.push(Number(row.timestamp));
      v.push(row.value);
    }
    return { t, v };
  }
}

export const variableService = new VariableService();
