import { z } from "zod";

export const createDeviceInputSchema = z.object({
  name: z.string().min(1, "Device name is required"),
  chip: z.string().optional(),
  device_key: z.string().optional(),
});

export const renameDeviceInputSchema = z.object({
  name: z.string().min(1, "Device name is required"),
});

export const createTokenInputSchema = z.object({
  name: z.string().optional(),
});

export const assignFirmwareInputSchema = z.object({
  firmware_id: z.string().nullable().optional(),
});

export type CreateDeviceInput = z.infer<typeof createDeviceInputSchema>;
export type RenameDeviceInput = z.infer<typeof renameDeviceInputSchema>;
export type CreateTokenInput = z.infer<typeof createTokenInputSchema>;
export type AssignFirmwareInput = z.infer<typeof assignFirmwareInputSchema>;

export const mapDevice = (d: {
  id: string;
  name: string;
  chip: string | null;
  firmwareVersion: string | null;
  isDefault: boolean;
  firstSeen: bigint | null;
  lastSeen: bigint | null;
  desiredFirmwareId: string | null;
  otaStatus: string | null;
}) => ({
  id: d.id,
  name: d.name,
  chip: d.chip,
  firmware_version: d.firmwareVersion,
  is_default: d.isDefault ? (1 as const) : (0 as const),
  first_seen: d.firstSeen ? Number(d.firstSeen) : null,
  last_seen: d.lastSeen ? Number(d.lastSeen) : null,
  desired_firmware_id: d.desiredFirmwareId,
  ota_status: d.otaStatus,
});

export const mapTokenDevice = (d: {
  id: string;
  name: string;
  chip: string | null;
  isDefault: boolean;
  firstSeen: bigint | null;
  lastSeen: bigint | null;
}) => ({
  id: d.id,
  name: d.name,
  chip: d.chip,
  is_default: d.isDefault ? 1 : 0,
  first_seen: d.firstSeen ? Number(d.firstSeen) : null,
  last_seen: d.lastSeen ? Number(d.lastSeen) : null,
});
