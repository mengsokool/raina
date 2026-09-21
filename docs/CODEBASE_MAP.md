# Codebase Map

เอกสารนี้ทำหน้าที่เป็นแผนที่นำทาง (Navigation Map) ของ Codebase โปรเจกต์ **Raina** เพื่อให้นักพัฒนาสามารถค้นหาตำแหน่งโค้ด, Entry point, สัญญาอินเทอร์เฟซ (Interfaces) และโครงสร้างพื้นฐานได้อย่างรวดเร็ว

---

## 1. Directory Structure Overview

```
raina/
├── apps/
│   ├── server/           # Backend API Server, RLP Gateway, Scheduler & Worker
│   └── web/              # Frontend Web Application (React Router v7 SSR & BFF)
├── packages/
│   ├── db/               # Database ORM, Prisma Client, TimescaleDB migrations
│   ├── rlp/              # Raina Link Protocol binary transport library
│   └── workflow/         # Automation AST, Block definitions & Integration handlers
├── sdks/
│   └── arduino/          # Arduino / ESP32 C++ client library
├── deploy/               # Deployment scripts and configurations
│   └── native/           # systemd service units, installer, and environment files
├── docker/               # Container configs (EMQX placeholder, etc.)
└── scripts/              # Developer scripts (IoT emulator)
```

---

## 2. Package Details & Interfaces

### 2.1 `packages/db` (@raina/db)
- **ตำแหน่ง**: `packages/db`
- **หน้าที่**: ชั้นจัดการความต่อเนื่องของข้อมูล (Persistence Layer) ผ่าน Prisma ORM
- **Public Exports** (`packages/db/src/index.ts`):
  - `prisma`: อินสแตนซ์ Singleton ของ `PrismaClient` (พร้อม Hot-reload caching ใน development)
  - Re-exports ของ Model types และ Enums ทั้งหมดจาก `@prisma/client`
- **ไฟล์สำคัญ**:
  - `prisma/schema.prisma`: นิยาม Schema ทั้งหมดของระบบ (12 Models)
  - `src/timescale.ts`: ฟังก์ชัน `configureTimescale()` ตั้งค่า TimescaleDB hypertable และ retention policy
  - `src/seed.ts`: สคริปต์สร้างข้อมูลจำลอง Smart Farm Greenhouse ตัวอย่าง

### 2.2 `packages/rlp` (@raina/rlp)
- **ตำแหน่ง**: `packages/rlp`
- **หน้าที่**: ไลบรารีไบนารีโปรโตคอล **Raina Link Protocol (RLP v1)** สำหรับการสื่อสารระหว่างฮาร์ดแวร์กับเซิร์ฟเวอร์
- **Public Exports** (`packages/rlp/src/index.ts`):
  - `createRlpServer(options: RlpServerOptions)`: สร้างอินสแตนซ์เซิร์ฟเวอร์ RLP
  - Classes: `RlpServer`, `RlpConnection`, `RlpError`
  - Enums: `PacketType`, `ValueType`, `ErrorCode`, `AckStatus`, `FrameFlag`
  - Types: `Sample`, `Command`, `Hello`, `AuthenticationResult`, `RlpValue`
- **ไฟล์สำคัญ**:
  - `src/index.ts`: Implementation ทั้งหมด (Binary framing 4-byte header, variable-length payload, TCP/TLS socket handling, backpressure queue)

### 2.3 `packages/workflow` (@raina/workflow)
- **ตำแหน่ง**: `packages/workflow`
- **หน้าที่**: โครงสร้างข้อมูล กฎ และตัวรัน Workflow Automation รวมถึงระบบ Integrations
- **Public Subpath Exports** (`packages/workflow/package.json`):
  - `.` / `./ast`: Types และ Zod schemas สำหรับ Automation Graph (`GraphNodeSchema`, `GraphEdgeSchema`, `AutomationGraphSchema`)
  - `./blocks`: Catalog ของ Blocks ทั้งหมด (Triggers, Conditions, Actions), Manifests, Summary formatters
  - `./integrations`: Specs, Handlers, Execution logic ของ Integrations ภายนอกทั้ง 8 ตัว
  - `./engine`: ตัวประเมินเงื่อนไขเปรียบเทียบ (`evaluateCondition`), Time window matcher (`matchTimeWindow`)
- **ไฟล์สำคัญ**:
  - `src/blocks/index.ts`: ฟังก์ชัน `findBlock(kind)`, `graphError(graph)`
  - `src/integrations/handlers.ts`: ฟังก์ชันยิง Webhook/API สำหรับ Telegram, Discord, Slack, Resend, Twilio, MS Teams, PagerDuty, HTTP Service
  - `src/integrations/specs.ts`: ค่า Specification ของทุก Integration สำหรับนำไปสร้าง UI Form ในหน้าบ้าน

---

## 3. Application Details & Entry Points

### 3.1 `apps/server` (@raina/server)
- **ตำแหน่ง**: `apps/server`
- **หน้าที่**: เซิร์ฟเวอร์ API กลาง, ตัวจัดการ Realtime WebSocket/SSE, RLP Gateway daemon, และ Background Worker
- **Entry Points**:
  1. `src/index.ts` — **Main HTTP & WebSocket Server** (เริ่มทำงานผ่านคำสั่ง `pnpm dev` หรือ `node dist/index.js`)
  2. `src/rlp-gateway.ts` — **RLP Binary Socket Daemon** (เริ่มทำงานผ่านคำสั่ง `node apps/server/dist/rlp-gateway.js` บนพอร์ต 9000/8883)
  3. `src/worker.ts` — **Dedicated Background Worker** (เริ่มทำงานผ่านคำสั่ง `node dist/worker.js`)
- **Modules โฟลเดอร์ (`src/modules/`)**:
  - `identity/`: การลงทะเบียน, Login, Session, Profile, Staff, Diagnostics (`identity.routes.ts`)
  - `projects/`: จัดการโครงการ CRUD (`projects.routes.ts`, `projects.service.ts`)
  - `project-users/`: จัดการสมาชิกในโครงการและสิทธิ์แดชบอร์ด (`project-users.routes.ts`)
  - `devices/`: จัดการอุปกรณ์และ Hardware Tokens (`devices.routes.ts`, `devices.service.ts`)
  - `variables/`: จัดการตัวแปรโปรเจกต์และ SSE stream (`variables.routes.ts`, `variables.service.ts`)
  - `telemetry/`: รับข้อมูล Telemetry และคำสั่ง Control (`telemetry.routes.ts`, `telemetry.service.ts`)
  - `dashboards/`: จัดการแดชบอร์ด, WebSocket handler, และ SSE stream (`dashboards.routes.ts`, `dashboards.ws.ts`, `dashboard-series.service.ts`)
  - `automations/`: จัดการ Automation CRUD, รัน Manual, ดู Run history, TypeSafe AI draft (`automations.routes.ts`, `automation-draft.service.ts`)
  - `integrations/`: จัดการ Credential ของระบบเชื่อมต่อภายนอก (`integrations.routes.ts`)
- **Infrastructure & Shared Utilities (`src/lib/`)**:
  - `auth.ts`: Middleware `requireAuth`, `requireStaff`, `requireAdmin`, ฟังก์ชัน `verifyProjectAccess`, `verifyDashboardAccess`, `verifyControlPermission`
  - `events.ts`: `eventBus` (In-memory) และ `initRealtimeBus()` (Redis Pub/Sub)
  - `redis.ts`: Redis Client singleton, Subscriber, Distributed lock (`withDistributedLock`)
  - `device-transport.ts`: `publishDeviceCommand()` สำหรับส่งคำสั่ง Downlink ผ่าน Redis
  - `engine.ts`: `executeAutomation()` เครื่องยนต์รัน Workflow แบบ Durable Step Checkpointing
  - `automation-queue.ts`: Redis Streams queue `raina:automation:evaluations` และ Consumer
  - `crypto.ts`: HKDF-AES-256-GCM สำหรับเข้ารหัสและถอดรหัส Integration Secrets
  - `ws-ticket.ts`: ตัวสร้างและตรวจสอบตั๋วเชื่อมต่อ WebSocket
  - `config.ts` / `env.ts`: ตัวตรวจสอบ Environment variable ด้วย Zod

### 3.2 `apps/web` (@raina/web)
- **ตำแหน่ง**: `apps/web`
- **หน้าที่**: เว็บแอปพลิเคชันสำหรับผู้ใช้และผู้ดูแลระบบ
- **Runtime Model**: React 19 บน **React Router v7** Framework Mode (SSR เปิดใช้งานใน `react-router.config.ts`)
- **Entry Points**:
  - `src/root.tsx`: Document root component (HTML structure, ThemeProvider, Toast/Scripts)
  - `src/routes.ts`: Central routing configuration
  - `src/routes/app-layout.tsx`: Root Layout ที่มี App Shell, Sidebar, Navigation และ Topbar
- **ไฟล์สำคัญในหน้าบ้าน**:
  - `src/routes/api-proxy.ts`: BFF Proxy ที่รับ request `/v1/*` แล้วแปลง Session cookie เป็น Header ส่งให้ Backend
  - `src/lib/api-client.ts`: Typesafe Hono RPC client (`hc<AppType>`)
  - `src/hooks/useDashboardRealtime.ts`: React Hook จัดการเชื่อมต่อ WebSocket อัตโนมัติ พร้อม Fallback เป็น SSE
  - `src/routes/dashboards/widgets/registry.ts`: Registry ทะเบียนวิดเจ็ตทั้งหมดบนแดชบอร์ด (Value, Gauge, Chart, Toggle, Push, Slider, Color, Percent)
  - `src/routes/automations/canvas/AutomationEditor.tsx`: Canvas แก้ไข Workflow รองรับ Drag & Drop (@xyflow/react)

---

## 4. Hardware SDK & Developer Utilities

### 4.1 `sdks/arduino` (@raina/arduino)
- **ตำแหน่ง**: `sdks/arduino`
- **หน้าที่**: C++ Driver สำหรับ ESP32 และ Arduino เชื่อมต่อตรงกับ Raina ผ่าน RLP v1 Socket
- **ไฟล์สำคัญ**:
  - `src/Raina.h` / `src/Raina.cpp`: Core C++ client, Macro `RAINA_ON(var)`, RLP binary frame pack/unpack, WiFi reconnection
  - `examples/`: ตัวอย่างโค้ด CompleteSmartFarm, SensorTelemetry, BasicRelayControl
  - `test/test_raina.cpp`: Unit test จำลอง Socket ไบนารี รันบน native C++

### 4.2 `scripts/emulator.ts`
- **ตำแหน่ง**: `scripts/emulator.ts`
- **หน้าที่**: สคริปต์ Node.js จำลองบอร์ดฮาร์ดแวร์ IoT เชื่อมต่อ RLP ไปยังพอร์ต 9000 ส่งข้อมูลอุณหภูมิ, ความชื้น, ดิน และรับคำสั่งสั่งการ
- **วิธีรัน**: `pnpm emulate`

---

## 5. Configuration & Deployment Files

| ไฟล์ | หน้าที่ความรับผิดชอบ |
| :--- | :--- |
| `package.json` | Root scripts: `dev`, `build`, `test`, `db:push`, `emulate`, `docker:up` |
| `pnpm-workspace.yaml` | นิยาม Workspace ของ Monorepo (`apps/*`, `packages/*`, `sdks/*`) |
| `.env.example` | Template รายการคอนฟิกทั้งหมดของระบบ พร้อมคำอธิบายและค่าเริ่มต้น |
| `docker-compose.yml` | Stack สำหรับ Production/Homelab (Postgres, Redis, Server, RLP Gateway, Web, Caddy) |
| `Caddyfile` | Reverse Proxy config สำหรับ Route `/v1/*` ไปที่ API และที่เหลือไปที่ Web |
| `deploy/native/` | สคริปต์ติดตั้งสำหรับ Linux ที่ไม่ใช้ Docker (`install.sh`, systemd unit files) |
| `.github/workflows/ci.yml` | GitHub Actions CI สำหรับ Build, Lint, Test ทุกแพ็กเกจรวมถึง Arduino SDK |
