import crypto from "crypto";
import { prisma } from "@raina/db";
import { broadcastControl } from "../../lib/events";
import { publishDeviceCommand } from "../../lib/device-transport";
import { getOrCreateDefaultDevice, processTelemetryPayload } from "../../services/telemetry.service";
import { enqueueAutomationEvaluation } from "../../lib/automation-queue";
import type { ControlInput, TelemetryHistoryResult } from "./telemetry.schema";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export class TelemetryModuleService {
  async authenticateDeviceToken(token: string) {
    const tokenHash = sha256(token);
    const projectToken = await prisma.projectToken.findUnique({
      where: { hash: tokenHash },
    });

    if (!projectToken || projectToken.revokedAt) {
      return null;
    }

    const now = BigInt(Date.now());
    await prisma.projectToken.update({
      where: { id: projectToken.id },
      data: { lastUsedAt: now },
    }).catch(() => {});

    return projectToken;
  }

  async processIncomingTelemetry(params: {
    projectId: string;
    tokenId: string;
    deviceId?: string;
    metrics: Record<string, unknown>;
    timestamp: number;
  }) {
    return processTelemetryPayload(params);
  }

  async executeControl(input: ControlInput) {
    const projectId = input.projectId || input.project_id!;
    const rawDeviceId = input.deviceId || input.device_id;
    const variableKey = input.variableKey || input.variable || input.key!;
    const value = input.value;

    const strVal = String(value).slice(0, 1024);
    const targetDeviceId = await getOrCreateDefaultDevice(projectId, rawDeviceId);
    const nowMs = Date.now();
    const nowBigInt = BigInt(nowMs);
    const numVal = Number(value);
    const isValidNumber = !isNaN(numVal) && isFinite(numVal);

    await prisma.projectVariable.upsert({
      where: {
        projectId_deviceId_key: {
          projectId,
          deviceId: targetDeviceId,
          key: variableKey,
        },
      },
      update: {
        value: strVal,
        updatedAt: nowBigInt,
        lastSeen: nowBigInt,
      },
      create: {
        id: `var_${projectId}_${targetDeviceId}_${variableKey}`,
        projectId,
        deviceId: targetDeviceId,
        key: variableKey,
        value: strVal,
        createdAt: nowBigInt,
        updatedAt: nowBigInt,
        lastSeen: nowBigInt,
      },
    });

    if (isValidNumber) {
      await prisma.telemetry.create({
        data: {
          projectId,
          deviceId: targetDeviceId,
          variableKey,
          value: numVal,
          timestamp: nowBigInt,
        },
      }).catch(() => {});
    }

    void publishDeviceCommand(projectId, targetDeviceId, {
      [variableKey]: value,
    });

    broadcastControl({
      projectId,
      deviceId: targetDeviceId,
      variable: variableKey,
      value,
      timestamp: nowMs,
    });

    await enqueueAutomationEvaluation({
      projectId,
      variableKey,
      value: isValidNumber ? numVal : value,
      deviceId: targetDeviceId,
    });

    return { ok: true, value: strVal, deviceId: targetDeviceId };
  }

  async getHistory(params: {
    projectId: string;
    variable: string;
    deviceId?: string;
    limit?: number;
    from?: bigint;
    to?: bigint;
  }): Promise<TelemetryHistoryResult> {
    const limit = Math.min(params.limit || 100, 1000);
    const whereClause: any = {
      projectId: params.projectId,
      variableKey: params.variable,
    };

    if (params.deviceId) {
      whereClause.deviceId = params.deviceId;
    }

    if (params.from || params.to) {
      whereClause.timestamp = {};
      if (params.from) whereClause.timestamp.gte = params.from;
      if (params.to) whereClause.timestamp.lte = params.to;
    }

    const rows = await prisma.telemetry.findMany({
      where: whereClause,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const t: number[] = [];
    const v: number[] = [];

    for (let i = rows.length - 1; i >= 0; i--) {
      t.push(Number(rows[i].timestamp));
      v.push(rows[i].value);
    }

    return {
      projectId: params.projectId,
      variable: params.variable,
      points: rows.length,
      series: { t, v },
    };
  }
}

export const telemetryModuleService = new TelemetryModuleService();
