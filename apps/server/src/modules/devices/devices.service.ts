import crypto from "crypto";
import { prisma } from "@raina/db";
import { nanoid } from "nanoid";
import { disconnectRlpDevice } from "../../lib/device-transport";
import {
  type CreateDeviceInput,
  type RenameDeviceInput,
  type CreateTokenInput,
  type AssignFirmwareInput,
  mapDevice,
  mapTokenDevice,
} from "./devices.schema";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export class DeviceService {
  async listDevices(projId: string) {
    const devices = await prisma.device.findMany({
      where: { projectId: projId },
      orderBy: { createdAt: "asc" },
    });
    return devices.map(mapDevice);
  }

  async createDevice(projId: string, input: CreateDeviceInput) {
    const now = BigInt(Date.now());
    const device = await prisma.device.create({
      data: {
        id: `dev_${nanoid(10)}`,
        projectId: projId,
        name: input.name,
        chip: input.chip ?? "ESP32",
        deviceKey: input.device_key ?? null,
        createdAt: now,
      },
    });
    return {
      id: device.id,
      name: device.name,
      chip: device.chip,
      is_default: 0 as const,
      first_seen: null,
      last_seen: null,
    };
  }

  async renameDevice(projId: string, deviceId: string, input: RenameDeviceInput) {
    const existing = await prisma.device.findFirst({
      where: { id: deviceId, projectId: projId },
    });
    if (!existing) return null;
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { name: input.name },
    });
    return { id: updated.id, name: updated.name };
  }

  async deleteDevice(projId: string, deviceId: string) {
    const existing = await prisma.device.findFirst({
      where: { id: deviceId, projectId: projId },
    });
    if (!existing) return null;
    await prisma.device.delete({ where: { id: deviceId } });
    void disconnectRlpDevice(projId, existing.id, existing.deviceKey ?? existing.id, "deleted");
    return { id: deviceId };
  }

  async assignFirmware(projId: string, deviceId: string, input: AssignFirmwareInput) {
    const existing = await prisma.device.findFirst({
      where: { id: deviceId, projectId: projId },
    });
    if (!existing) return null;
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { desiredFirmwareId: input.firmware_id ?? null },
    });
    return { id: updated.id, desired_firmware_id: updated.desiredFirmwareId };
  }

  async listTokens(projId: string) {
    const tokens = await prisma.projectToken.findMany({
      where: { projectId: projId, revokedAt: null },
      include: { devices: { orderBy: { lastSeen: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      created_at: Number(t.createdAt),
      last_used_at: t.lastUsedAt ? Number(t.lastUsedAt) : null,
      revoked_at: t.revokedAt ? Number(t.revokedAt) : null,
      devices: (t.devices ?? []).map(mapTokenDevice),
    }));
  }

  async createToken(projId: string, input: CreateTokenInput) {
    const now = BigInt(Date.now());
    const plainSecret = `tok_${nanoid(24)}`;
    const token = await prisma.projectToken.create({
      data: {
        id: `t_${nanoid(10)}`,
        projectId: projId,
        name: input.name ?? "Device Token",
        hash: sha256(plainSecret),
        createdAt: now,
      },
    });
    return {
      id: token.id,
      name: token.name,
      token: plainSecret,
      created_at: Number(token.createdAt),
    };
  }

  async revokeToken(projId: string, tokenId: string) {
    const now = BigInt(Date.now());
    const updated = await prisma.projectToken.updateMany({
      where: { id: tokenId, projectId: projId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (updated.count === 0) return null;

    const bound = await prisma.device.findMany({
      where: { projectId: projId, tokenId },
      select: { id: true, deviceKey: true },
    });
    for (const dev of bound) void disconnectRlpDevice(projId, dev.id, dev.deviceKey ?? dev.id, "revoked");
    return { id: tokenId, revoked_at: Number(now) };
  }
}

export const deviceService = new DeviceService();
