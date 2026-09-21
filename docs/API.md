# API Reference

เอกสารอ้างอิง REST & Streaming API ทั้งหมดของ **Raina** รวบรวมจาก Route Implementation จริงใน `apps/server/src/modules/`

---

## สรุปภาพรวม Domain & Authentication Levels

| สัญลักษณ์ | ความหมาย |
| :--- | :--- |
| **Public** | ไม่ต้องยืนยันตัวตน (Unauthenticated) |
| **Hardware Token** | ตรวจสอบผ่าน Header `x-device-token` หรือ `Authorization: Bearer <TOKEN>` หรือ Query `?token=` |
| **User Session** | ตรวจสอบผ่าน Cookie (`raina_session`), Header `x-session-token`, หรือ Bearer Token |
| **Staff Only** | ต้องมี Role: `owner`, `admin`, หรือ `staff` |
| **Admin Only** | ต้องมี Role: `owner` หรือ `admin` |
| **Owner Only** | ต้องมี Role: `owner` เท่านั้น |

---

## 1. System & Diagnostics Domain

### `GET /healthz`
- **Auth**: Public
- **Handler**: `apps/server/src/index.ts`
- **Response**: `200 OK`
  ```json
  { "ok": true, "timestamp": 1774396800000 }
  ```

### `GET /v1/version`
- **Auth**: Public
- **Handler**: `apps/server/src/index.ts`
- **Response**: `200 OK`
  ```json
  { "name": "raina", "version": "1.0.0", "stack": "hono+prisma+rlp" }
  ```

### `GET /v1/public/endpoints`
- **Auth**: Public
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `getPublicEndpoints`
- **Response**: `200 OK`
  ```json
  {
    "rlp": "rlp://127.0.0.1:9000",
    "http": "http://127.0.0.1:3001/v1/telemetry"
  }
  ```

### `GET /v1/public/bootstrap-status`
- **Auth**: Public
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleBootstrapStatus`
- **Response**: `200 OK`
  ```json
  { "bootstrap": false, "requiresSetupToken": false }
  ```

### `GET /v1/admin/diagnostics`
- **Auth**: Staff Only (`requireStaff`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleDiagnostics`
- **Response**: `200 OK` แสดงสถานะ Latency ของ DB, Redis, Memory, Uptime, จำนวน Entity ทั้งหมด

---

## 2. Authentication & Identity Domain

### `POST /v1/auth/bootstrap`
- **Auth**: Public (ใช้งานได้เฉพาะเมื่อยังไม่มี User ในระบบเลย และตรวจสอบ Advisory Lock `73461825`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleBootstrap`
- **Body**:
  ```json
  {
    "email": "owner@example.com",
    "username": "admin",
    "name": "System Owner",
    "password": "strongPassword123",
    "setupToken": "secret"
  }
  ```
- **Response**: `200 OK` พร้อม Header `Set-Cookie: raina_session=...`

### `POST /v1/auth/sign-in` (และ `/v1/auth/sign-in/email`)
- **Auth**: Public (จำกัด 10 ครั้ง/นาที ต่อ IP ผ่าน `checkLoginRateLimit`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleSignIn`
- **Body**:
  ```json
  {
    "username": "admin",
    "password": "password123"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "user": { "id": "usr_123", "username": "admin", "email": "admin@example.com", "role": "owner", "name": "Admin" },
    "token": "64_hex_session_token"
  }
  ```
  *(พร้อมส่ง Header `Set-Cookie: raina_session=...`)*

### `POST /v1/auth/sign-out`
- **Auth**: User Session
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleSignOut`
- **Response**: `200 OK` พร้อมล้าง Session ในฐานข้อมูลและส่ง Header ลบ Cookie

### `POST /v1/auth/ws-ticket`
- **Auth**: User Session (`requireAuth`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleWsTicket`
- **Response**: `200 OK`
  ```json
  { "ticket": "signed_ws_ticket_string", "expiresIn": 60 }
  ```

### `GET /v1/auth/me` (และ `/v1/admin/me`)
- **Auth**: User Session
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleMe`
- **Response**: `200 OK` แสดงโปรไฟล์ผู้ใช้, รายการ Projects ที่เข้าถึงได้, และ Dashboards ที่มีสิทธิ์

### `PATCH /v1/auth/profile`
- **Auth**: User Session
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleProfileUpdate`
- **Body**: `{ "name"?: string, "email"?: string, "currentPassword"?: string, "newPassword"?: string }`

### `GET /v1/admin/staff`
- **Auth**: Staff Only (`requireStaff`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleListStaff`

### `POST /v1/admin/staff`
- **Auth**: Admin Only (`requireAdmin`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleCreateStaff`
- **Body**: `{ "username": string, "password": string, "name"?: string, "email"?: string, "role"?: "admin" | "staff" }`

### `PUT /v1/admin/staff/:id`
- **Auth**: Admin Only (`requireAdmin`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleUpdateStaff`

### `DELETE /v1/admin/staff/:id`
- **Auth**: Admin Only (`requireAdmin`)
- **Handler**: `apps/server/src/modules/identity/identity.routes.ts` — `handleDeleteStaff`

---

## 3. Telemetry & Control Domain

### `POST /v1/telemetry`
- **Auth**: Hardware Token (`x-device-token`)
- **Handler**: `apps/server/src/modules/telemetry/telemetry.routes.ts` — `handleTelemetry`
- **Service**: `apps/server/src/services/telemetry.service.ts` — `processTelemetryPayload`
- **Body**:
  ```json
  {
    "deviceId": "esp32_sensor",
    "ts": 1774396800000,
    "metrics": {
      "temperature": 28.5,
      "humidity": 65.2
    }
  }
  ```
- **Response**: `200 OK` `{ "ok": true, "deviceId": "dev_abc", "processed": 2 }`
- **Error Cases**:
  - `401 Unauthorized`: Token ผิดหรือไม่ระบุ
  - `400 Bad Request`: JSON ผิดรูปแบบ หรือ `deviceId` มีอักขระไม่อนุญาต
  - `403 Forbidden`: เกิด Device ownership conflict (Token อื่นพยายามส่งข้อมูลในชื่ออุปกรณ์ที่ผูกกับ Token แรกไว้)
  - `413 Payload Too Large`: Payload เกิน 64KB

### `POST /v1/control`
- **Auth**: User Session (`authenticateSession` + `verifyControlPermission`)
- **Handler**: `apps/server/src/modules/telemetry/telemetry.routes.ts` — `handleControl`
- **Service**: `apps/server/src/modules/telemetry/telemetry.service.ts` — `executeControl`
- **Body**:
  ```json
  {
    "projectId": "proj_123",
    "deviceId": "dev_456",
    "variableKey": "pump_relay",
    "value": true
  }
  ```
- **Response**: `200 OK` `{ "ok": true, "value": "true", "deviceId": "dev_456" }`

### `GET /v1/projects/:proj/telemetry/history`
- **Auth**: User Session (`verifyProjectAccess(..., 'view')`)
- **Handler**: `apps/server/src/modules/telemetry/telemetry.routes.ts` — `handleHistory`
- **Parameters**: `variable` (required), `deviceId` (optional), `limit` (max 1000), `from` (optional), `to` (optional)
- **Response**: `200 OK` `{ "projectId": string, "variable": string, "points": number, "series": { "t": number[], "v": number[] } }`

---

## 4. Dashboards & Streaming Domain

### `GET /v1/dashboards`
- **Auth**: User Session (กรองแดชบอร์ดตามสิทธิ์ Client / Staff)
- **Parameters**: `project_id` (optional query)
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `listDashboards`

### `POST /v1/dashboards`
- **Auth**: Staff Only (`requireStaff`)
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `createDashboardDirect`

### `GET /v1/dashboards/:id`
- **Auth**: User Session (`verifyDashboardAccess`)
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `getDashboardById`

### `PUT /v1/dashboards/:id`
- **Auth**: Staff Only (`requireStaff`)
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `updateDashboardDirect`

### `DELETE /v1/dashboards/:id`
- **Auth**: Staff Only (`requireStaff`)
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `deleteDashboardDirect`

### `GET /v1/dashboards/public/:token` (และ `/v1/public/dashboards/:token`)
- **Auth**: Public หากแดชบอร์ดตั้งค่า `visibility: "public"`, ตรวจสอบ User Session หากตั้งเป็น `users_only`
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `handlePublicDashboard`

### `GET /v1/dashboards/:id/stream` (Server-Sent Events)
- **Auth**: ตรวจสิทธิ์ผ่าน Session หรือ Share Token
- **Handler**: `apps/server/src/modules/dashboards/dashboards.routes.ts` — `handleStream`
- **Output**: `text/event-stream` ส่ง snapshot เริ่มต้น, ส่ง live events (`telemetry`, `control`, `device_status`), ส่ง `: ping\n\n` ทุก 15 วินาที

### `GET /v1/dashboards/:id/ws` (WebSocket Upgrade)
- **Auth**: Ticket ผ่าน Header `Sec-WebSocket-Protocol: raina-ticket.<ticket>` หรือ Session Cookie
- **Handler**: `apps/server/src/modules/dashboards/dashboards.ws.ts` — `dashboardWsHandler`
- **Lifecycle**:
  - ส่ง Snapshot ทันทีหลังเชื่อมต่อ
  - ส่ง Ping ทุก 20 วินาที
  - รองรับข้อความจาก Client: `{ "type": "ping" }` (ตอบกลับ pong), `{ "type": "control", "variable", "value" }` (ตรวจสอบสิทธิ์และส่งคำสั่ง)

---

## 5. Projects & Resources Domain

| Method | Path | Auth | หน้าที่ |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/admin/projects` | User Session | แสดงรายการโปรเจกต์ของผู้ใช้ |
| `POST` | `/v1/admin/projects` | Staff Only | สร้างโปรเจกต์ใหม่ |
| `GET` | `/v1/admin/projects/:proj` | Project Access | ดูรายละเอียดโปรเจกต์ |
| `PUT` | `/v1/admin/projects/:proj` | Staff Only | แก้ไขข้อมูลโปรเจกต์ |
| `DELETE` | `/v1/admin/projects/:proj` | Staff Only | Soft-delete (archivedAt) |
| `GET` | `/v1/admin/projects/:proj/users` | Staff Only | ดูสมาชิกและสิทธิ์แดชบอร์ด |
| `POST` | `/v1/admin/projects/:proj/users` | Staff Only | เพิ่มสมาชิกและกำหนดสิทธิ์ |
| `PUT` | `/v1/admin/projects/:proj/users/:userId` | Staff Only | แก้ไขสิทธิ์สมาชิก |
| `DELETE` | `/v1/admin/projects/:proj/users/:userId` | Staff Only | ลบสมาชิกออกจากโปรเจกต์ |
| `GET` | `/v1/admin/projects/:proj/devices` | Staff Only | ดูรายการอุปกรณ์ในโปรเจกต์ |
| `POST` | `/v1/admin/projects/:proj/devices` | Staff Only | สร้างอุปกรณ์แบบกำหนดเอง |
| `PATCH` | `/v1/admin/projects/:proj/devices/:id` | Staff Only | เปลี่ยนชื่ออุปกรณ์ |
| `DELETE` | `/v1/admin/projects/:proj/devices/:id` | Staff Only | ลบอุปกรณ์ |
| `GET` | `/v1/admin/projects/:proj/tokens` | Staff Only | ดูรายการ Hardware Tokens |
| `POST` | `/v1/admin/projects/:proj/tokens` | Staff Only | สร้าง Token ใหม่ (แสดงค่าดิบครั้งเดียว) |
| `POST` | `/v1/admin/projects/:proj/tokens/:id/revoke` | Staff Only | ยกเลิกสิทธิ์ Token |

---

## 6. Automations & Integrations Domain

### `POST /v1/admin/projects/:proj/automations/draft`
- **Auth**: Staff Only
- **Handler**: `apps/server/src/modules/automations/automations.routes.ts`
- **Body**: `{ "prompt": string (min 8, max 1000), "timezone": string }`
- **Service**: เรียก TypeSafe AI Jev model เพื่อสร้าง Graph Draft

### `GET /v1/admin/projects/:proj/automations`
- **Auth**: Staff Only
- **Handler**: `apps/server/src/modules/automations/automations.routes.ts`

### `POST /v1/admin/projects/:proj/automations`
- **Auth**: Staff Only
- **Handler**: `apps/server/src/modules/automations/automations.routes.ts`
- **Body**: `{ "name": string, "graph": { "nodes": [], "edges": [] }, "enabled"?: boolean }`

### `POST /v1/admin/projects/:proj/automations/:id/run`
- **Auth**: Staff Only
- **Handler**: `apps/server/src/modules/automations/automations.routes.ts`
- **Body**: `{ "variable"?: string, "value"?: unknown, "payload"?: object }`
- **Service**: เรียก `executeAutomation(..., { source: 'manual' })`

### `GET /v1/admin/projects/:proj/automations/:id/runs`
- **Auth**: Staff Only
- **Response**: รายการประวัติการรันล่าสุด สถานะ และเวลา

### `GET /v1/admin/projects/:proj/automations/:id/runs/:runId`
- **Auth**: Staff Only
- **Response**: ข้อมูลการรันแบบละเอียดราย Node พร้อม Input/Output ของแต่ละ Step

### `POST /v1/admin/projects/:proj/automations/:id/runs/:runId/retry`
- **Auth**: Staff Only
- **Service**: Resume การรันต่อจาก Node ที่ล้มเหลวเดิม

### `GET /v1/admin/projects/:proj/integrations`
- **Auth**: Staff Only
- **Handler**: `apps/server/src/modules/integrations/integrations.routes.ts` — `listIntegrationsHandler`
- **Response**: รายการ Integrations โดยค่า Secrets ในคอนฟิกจะถูก Mask (เช่น `••••abcd`)

### `POST /v1/admin/projects/:proj/integrations`
- **Auth**: Staff Only
- **Body**: `{ "name": string, "kind": string, "config": object, "enabled"?: boolean }`
- **Security**: คอนฟิกจะถูกเข้ารหัสผ่าน `sealIntegrationConfig` ด้วย AES-256-GCM ก่อนบันทึก

### `POST /v1/admin/projects/:proj/integrations/:id/test`
- **Auth**: Staff Only
- **Handler**: `apps/server/src/modules/integrations/integrations.routes.ts` — `testIntegrationHandler`
- **Body**: `{ "message"?: string, "params"?: object }`
- **Execution**: ถอดรหัสคอนฟิกและเรียก API ภายนอกจริงเพื่อทดสอบ
