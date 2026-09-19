import { zValidator } from "@hono/zod-validator";
import { createRouter } from "../../env";
import { requireStaff } from "../../lib/auth";
import { getRequiredParam } from "../../lib/params";
import {
  createDeviceInputSchema,
  renameDeviceInputSchema,
  createTokenInputSchema,
  assignFirmwareInputSchema,
} from "./devices.schema";
import { deviceService } from "./devices.service";

export const devicesRouter = createRouter()
  // --- Devices (canonical /admin paths for RPC) ---
  .get("/admin/projects/:proj/devices", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const devices = await deviceService.listDevices(proj);
    return c.json(devices);
  })
  .post("/admin/projects/:proj/devices", requireStaff, zValidator("json", createDeviceInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const device = await deviceService.createDevice(proj, c.req.valid("json"));
    return c.json(device);
  })
  .patch("/admin/projects/:proj/devices/:id", requireStaff, zValidator("json", renameDeviceInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const updated = await deviceService.renameDevice(proj, id, c.req.valid("json"));
    if (!updated) return c.json({ error: "Device not found" }, 404);
    return c.json(updated);
  })
  .delete("/admin/projects/:proj/devices/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const result = await deviceService.deleteDevice(proj, id);
    if (!result) return c.json({ error: "Device not found" }, 404);
    return c.json({ success: true, id });
  })
  .post("/admin/projects/:proj/devices/:id/firmware", requireStaff, zValidator("json", assignFirmwareInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const updated = await deviceService.assignFirmware(proj, id, c.req.valid("json"));
    if (!updated) return c.json({ error: "Device not found" }, 404);
    return c.json(updated);
  })
  // --- Tokens (canonical /admin paths) ---
  .get("/admin/projects/:proj/tokens", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const tokens = await deviceService.listTokens(proj);
    return c.json(tokens);
  })
  .post("/admin/projects/:proj/tokens", requireStaff, zValidator("json", createTokenInputSchema), async (c) => {
    const proj = getRequiredParam(c, "proj");
    const token = await deviceService.createToken(proj, c.req.valid("json"));
    return c.json(token, 201);
  })
  .post("/admin/projects/:proj/tokens/:id/revoke", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const result = await deviceService.revokeToken(proj, id);
    if (!result) return c.json({ error: "not_found" }, 404);
    return c.json(result);
  })
  // --- Alias /projects/... paths (backward compat) ---
  .get("/projects/:proj/devices", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const devices = await deviceService.listDevices(proj);
    return c.json(devices);
  })
  .post("/projects/:proj/devices", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const body = await c.req.json();
    const device = await deviceService.createDevice(proj, body);
    return c.json({ id: device.id, name: device.name, chip: device.chip, is_default: 0, first_seen: null, last_seen: null });
  })
  .patch("/projects/:proj/devices/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const body = await c.req.json();
    const updated = await deviceService.renameDevice(proj, id, body);
    if (!updated) return c.json({ error: "Device not found" }, 404);
    return c.json(updated);
  })
  .delete("/projects/:proj/devices/:id", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const result = await deviceService.deleteDevice(proj, id);
    if (!result) return c.json({ error: "Device not found" }, 404);
    return c.json({ success: true, id });
  })
  .post("/projects/:proj/devices/:id/firmware", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const body = await c.req.json();
    const updated = await deviceService.assignFirmware(proj, id, body);
    if (!updated) return c.json({ error: "Device not found" }, 404);
    return c.json(updated);
  })
  .get("/projects/:proj/tokens", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const tokens = await deviceService.listTokens(proj);
    return c.json(tokens);
  })
  .post("/projects/:proj/tokens", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const body = await c.req.json().catch(() => ({}));
    const token = await deviceService.createToken(proj, body);
    return c.json(token, 201);
  })
  .post("/projects/:proj/tokens/:id/revoke", requireStaff, async (c) => {
    const proj = getRequiredParam(c, "proj");
    const id = getRequiredParam(c, "id");
    const result = await deviceService.revokeToken(proj, id);
    if (!result) return c.json({ error: "not_found" }, 404);
    return c.json(result);
  });

export default devicesRouter;
