import { prisma } from "@raina/db";
import { broadcastTelemetry, broadcastEvent } from "../lib/events";
import { evaluateVariableAutomations } from "../lib/evaluator";
import { nanoid } from "nanoid";

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;

// In-memory throttling map to prevent excessive DB writes for device.lastSeen
// Throttles DB updates to at most once every 30 seconds per device while SSE remains instant.
const deviceLastSeenDbMap = new Map<string, number>();
const LAST_SEEN_DB_THROTTLE_MS = 30_000;

export function shouldUpdateDeviceLastSeen(deviceId: string, nowMs: number): boolean {
  const lastUpdated = deviceLastSeenDbMap.get(deviceId) || 0;
  if (nowMs - lastUpdated >= LAST_SEEN_DB_THROTTLE_MS) {
    deviceLastSeenDbMap.set(deviceId, nowMs);
    return true;
  }
  return false;
}

export function resetDeviceLastSeenThrottle() {
  deviceLastSeenDbMap.clear();
}

function sanitizeTimestamp(rawTs: unknown): number {
  const now = Date.now();
  if (typeof rawTs !== "number" || isNaN(rawTs) || !isFinite(rawTs)) {
    return now;
  }
  const tsInMs = rawTs > 1e11 ? rawTs : rawTs * 1000;
  // Window: [-24 hours, +10 minutes]
  const minAllowed = now - 24 * 60 * 60 * 1000;
  const maxAllowed = now + 10 * 60 * 1000;
  if (tsInMs < minAllowed || tsInMs > maxAllowed) {
    return now;
  }
  return Math.floor(tsInMs);
}

/**
 * Resolves the device ID for a project.
 * Matches by DB id, deviceKey, or hardware name.
 * Prevents cross-token device hijacking within multi-device projects.
 */
export async function getOrCreateDefaultDevice(
  projectId: string,
  customDeviceId?: string,
  tokenId?: string
): Promise<string> {
  const now = BigInt(Date.now());

  if (customDeviceId && customDeviceId.trim() !== "") {
    const trimmed = customDeviceId.trim().replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
    const existing = await prisma.device.findFirst({
      where: {
        projectId,
        OR: [
          { id: trimmed },
          { deviceKey: trimmed },
          { name: trimmed },
        ],
      },
    });

    if (existing) {
      // SECURITY FIX VULN-IOT-04: Cross-token device hijacking check!
      // If the device is already bound to a specific token and a different token presents it, reject!
      if (tokenId && existing.tokenId && existing.tokenId !== tokenId) {
        throw new Error("Device ownership conflict: Device is registered to another hardware token");
      }

      if (tokenId && !existing.tokenId) {
        await prisma.device.update({
          where: { id: existing.id },
          data: { tokenId },
        }).catch(() => {});
      }
      return existing.id;
    }

    // Auto-provision this named hardware device with collision-free ID
    const newId = `dev_${nanoid(16)}`;
    const createdDevice = await prisma.device.create({
      data: {
        id: newId,
        projectId,
        tokenId: tokenId || null,
        name: trimmed,
        deviceKey: trimmed,
        isDefault: false,
        createdAt: now,
        firstSeen: now,
        lastSeen: now,
      },
    }).catch(async () => {
      // In case of concurrent creation race, lookup one more time
      return prisma.device.findFirst({
        where: { projectId, OR: [{ deviceKey: trimmed }, { name: trimmed }] },
      });
    });

    if (createdDevice) {
      if (tokenId && createdDevice.tokenId && createdDevice.tokenId !== tokenId) {
        throw new Error("Device ownership conflict: Device is registered to another hardware token");
      }
      if (tokenId && !createdDevice.tokenId) {
        await prisma.device.update({
          where: { id: createdDevice.id },
          data: { tokenId },
        }).catch(() => {});
      }
      return createdDevice.id;
    }
  }

  // Fallback to default device
  const defaultDevice =
    (await prisma.device.findFirst({
      where: { projectId, isDefault: true },
    })) ||
    (await prisma.device.findFirst({
      where: { projectId },
    }));

  if (defaultDevice) {
    if (tokenId && defaultDevice.tokenId && defaultDevice.tokenId !== tokenId) {
      throw new Error("Device ownership conflict: Default device is registered to another hardware token");
    }
    if (tokenId && !defaultDevice.tokenId) {
      await prisma.device.update({
        where: { id: defaultDevice.id },
        data: { tokenId },
      }).catch(() => {});
    }
    return defaultDevice.id;
  }

  // Auto-provision default device for this project
  const newDefaultId = `dev_${nanoid(16)}`;
  const created = await prisma.device.create({
    data: {
      id: newDefaultId,
      projectId,
      tokenId: tokenId || null,
      name: "Default Device",
      isDefault: true,
      createdAt: now,
      firstSeen: now,
      lastSeen: now,
    },
  }).catch(async () => {
    return prisma.device.findFirst({
      where: { projectId, isDefault: true },
    });
  });

  if (created) {
    if (tokenId && created.tokenId && created.tokenId !== tokenId) {
      throw new Error("Device ownership conflict: Default device is registered to another hardware token");
    }
    if (tokenId && !created.tokenId) {
      await prisma.device.update({
        where: { id: created.id },
        data: { tokenId },
      }).catch(() => {});
    }
    return created.id;
  }

  return newDefaultId;
}

export interface IngestTelemetryParams {
  projectId: string;
  deviceId?: string;
  tokenId?: string;
  metrics: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Central telemetry processing engine.
 * Used by both HTTP POST /v1/telemetry and EMQX MQTT message subscribers.
 */
export async function processTelemetryPayload({
  projectId,
  deviceId,
  tokenId,
  metrics,
  timestamp = Date.now(),
}: IngestTelemetryParams) {
  const resolvedDeviceId = await getOrCreateDefaultDevice(projectId, deviceId, tokenId);
  const sanitizedTs = sanitizeTimestamp(timestamp);
  const now = BigInt(sanitizedTs);

  // 1. Throttled device lastSeen update in DB (prevents write contention on high frequency payloads)
  if (shouldUpdateDeviceLastSeen(resolvedDeviceId, sanitizedTs)) {
    void prisma.device
      .update({
        where: { id: resolvedDeviceId },
        data: { lastSeen: now },
      })
      .catch(() => {});
  }

  // 2. Realtime SSE status broadcast (immediate 0ms latency)
  broadcastEvent({
    type: "device_status",
    projectId,
    deviceId: resolvedDeviceId,
    status: "online",
    timestamp: sanitizedTs,
  });

  const processed: Array<{ key: string; value: unknown }> = [];
  const telemetryBatch: Array<{
    projectId: string;
    deviceId: string;
    variableKey: string;
    value: number;
    timestamp: bigint;
  }> = [];

  const upsertPromises: Array<Promise<unknown>> = [];

  // Enforce maximum 50 metric keys per payload to prevent DoS resource exhaustion
  const entries = Object.entries(metrics || {}).slice(0, 50);

  for (const [rawKey, rawVal] of entries) {
    if (typeof rawVal === "object" && rawVal !== null) continue;

    // Validate key name format (alphanumeric, dashes, underscores, dots, max 64 chars)
    const key = rawKey.trim();
    if (!SAFE_IDENTIFIER_REGEX.test(key)) {
      continue;
    }

    // Limit value length to 512 bytes
    const strVal = String(rawVal).slice(0, 512);
    const numVal = Number(strVal);
    const isValidNumber = !isNaN(numVal) && isFinite(numVal);
    const parsedVal = isValidNumber ? numVal : strVal;

    // Queue concurrent upsert for project variable latest state
    upsertPromises.push(
      prisma.projectVariable.upsert({
        where: {
          projectId_deviceId_key: {
            projectId,
            deviceId: resolvedDeviceId,
            key,
          },
        },
        update: {
          value: strVal,
          updatedAt: now,
          lastSeen: now,
        },
        create: {
          id: `var_${projectId}_${resolvedDeviceId}_${key}`,
          projectId,
          deviceId: resolvedDeviceId,
          key,
          value: strVal,
          createdAt: now,
          updatedAt: now,
          lastSeen: now,
        },
      })
    );

    // If numeric, queue for batch historical telemetry insert
    if (isValidNumber) {
      telemetryBatch.push({
        projectId,
        deviceId: resolvedDeviceId,
        variableKey: key,
        value: numVal,
        timestamp: now,
      });
    }

    // Broadcast realtime event to SSE subscribers of this project immediately
    broadcastTelemetry({
      projectId,
      deviceId: resolvedDeviceId,
      variable: key,
      value: parsedVal,
      timestamp: sanitizedTs,
    });

    // Run realtime workflow evaluation on incoming telemetry
    void evaluateVariableAutomations(projectId, key, parsedVal, resolvedDeviceId);

    processed.push({ key, value: parsedVal });
  }

  // 3. Parallel execute all variable upserts + historical telemetry batch insert
  const dbOperations: Array<Promise<unknown>> = [...upsertPromises];
  if (telemetryBatch.length > 0) {
    dbOperations.push(
      prisma.telemetry.createMany({
        data: telemetryBatch,
      }).catch((err) => {
        console.error("[Telemetry Batch Insert Error]:", err);
      })
    );
  }

  if (dbOperations.length > 0) {
    await Promise.all(dbOperations);
  }

  return { deviceId: resolvedDeviceId, processed };
}
