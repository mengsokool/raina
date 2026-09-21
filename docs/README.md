# Raina Documentation Index

ยินดีต้อนรับสู่ชุดเอกสารอ้างอิงสถาปัตยกรรมและคู่มือเชิงลึกของโปรเจกต์ **Raina** (ระบบ IoT Cloud Platform แบบ Self-hosted สำหรับบริหารจัดการอุปกรณ์ แสดงผลข้อมูล Telemetry แบบ Realtime และรัน Automations แบบ Durable Execution)

เอกสารทั้งชุดนี้ถูกจัดทำขึ้นโดยการวิเคราะห์จาก **Source Code ปัจจุบันเป็น Source of Truth** พร้อมระบุ file path, exported symbol, และ trace data flow จริงตลอดทั้งระบบ

---

## 1. ภาพรวมของระบบ (System Overview)

Raina ประกอบด้วยส่วนประกอบหลักในรูปแบบ pnpm monorepo:
1. **Frontend (`apps/web`)**: Web UI สำหรับควบคุมอุปกรณ์, มอนิเตอร์แดชบอร์ด, จัดการโปรเจกต์ และสร้าง/แก้ไข Automations ทำงานบน **React Router v7** (Framework Mode พร้อม SSR และ BFF Proxy) ร่วมกับ Tailwind CSS v4, Radix UI, Recharts และ `@xyflow/react`
2. **Backend Server (`apps/server`)**: REST API & Realtime Server พัฒนาด้วย **Hono** บน Node.js runtime ทำหน้าที่ตรวจสอบสิทธิ์ (RBAC / Session Cookies / WS Ticket), บริหารจัดการ Project Resources, สตรีม Realtime Telemetry ผ่าน WebSocket (`@hono/node-ws`) และ Server-Sent Events (SSE), พร้อมรัน Automation Evaluation
3. **RLP Device Gateway (`apps/server/src/rlp-gateway.ts`)**: TCP/TLS Binary Socket Gateway สำหรับอุปกรณ์ไมโครคอนโทรลเลอร์ (ESP32 / Arduino / MicroPython) โดยใช้โปรโตคอลเฉพาะ **Raina Link Protocol (RLP v1)** จากแพ็กเกจ `@raina/rlp`
4. **Background Worker (`apps/server/src/worker.ts`)**: โพรเซสประมวลผลแบ็กกราวด์ รองรับการสเกลแยกอิสระ จัดการ Distributed Lock, Redis Streams consumer สำหรับ Automation, Schedule/Solar timers และ Telemetry retention cleanup
5. **Database Layer (`packages/db`)**: จัดเก็บข้อมูลถาวรผ่าน **Prisma ORM** โดยเชื่อมต่อกับ **PostgreSQL 17** และรองรับ TimescaleDB Hypertable สำหรับข้อมูล Time-series Telemetry
6. **Workflow Engine (`packages/workflow`)**: โมดูลแกนกลางสำหรับการนิยาม Block manifest, AST validation, Graph traversal, Integrations execution และการประเมินเงื่อนไข
7. **Arduino / ESP32 SDK (`sdks/arduino`)**: ไคลเอนต์ C++ สำหรับไมโครคอนโทรลเลอร์ สื่อสารผ่าน RLP v1 binary transport

---

## 2. รายการเอกสารทั้งหมด (Documentation Map)

| เอกสาร | หน้าที่และเนื้อหาหลัก |
| :--- | :--- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | สถาปัตยกรรมระดับระบบ, Monorepo structure, Module boundaries, Runtime processes, Technical debt |
| [CODEBASE_MAP.md](./CODEBASE_MAP.md) | แผนผังโฟลเดอร์, แพ็กเกจ, Entry points, ตำแหน่งไฟล์สำคัญ และหน้าที่ความรับผิดชอบ |
| [FRONTEND.md](./FRONTEND.md) | สถาปัตยกรรมฝั่งหน้าบ้าน: React Router v7, SSR, BFF session/proxy, State, Realtime hooks, Widgets |
| [BACKEND.md](./BACKEND.md) | สถาปัตยกรรมฝั่งหลังบ้าน: Hono routes, Middleware, Services, Process boundaries, Error handling |
| [API.md](./API.md) | เอกสารอ้างอิง REST & Streaming API ทุก endpoint พร้อมพารามิเตอร์, สิทธิ์, Handler และ Service |
| [AUTH.md](./AUTH.md) | ระบบ Authentication & Authorization: Session cookies, Scrypt password hashing, RBAC, WS Tickets |
| [TELEMETRY.md](./TELEMETRY.md) | สถาปัตยกรรม Telemetry แบบ End-to-End ตั้งแต่อุปกรณ์ IoT, RLP binary gateway, Storage จนถึง UI |
| [DATABASE.md](./DATABASE.md) | โมเดลฐานข้อมูล Prisma, PostgreSQL 17, TimescaleDB Hypertables, Indexes, Retention, Concurrency |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | ระบบเชื่อมต่อภายนอก (8 ชนิด: HTTP, Telegram, Slack, Discord, Email, Twilio, Teams, PagerDuty) และการเข้ารหัสลับ |
| [AUTOMATION.md](./AUTOMATION.md) | Durable Workflow Engine: Graph AST, Triggers, Conditions, Actions, Delays, Retries, TypeSafe AI |
| [REALTIME.md](./REALTIME.md) | ระบบ Realtime Telemetry: EventBus ในเครื่อง, Redis Pub/Sub แบบกระจาย, WebSocket และ SSE fallback |
| [CONFIGURATION.md](./CONFIGURATION.md) | สรุป Environment Variables ทั้งหมดของระบบ, ค่าเริ่มต้น, ผลกระทบ และตำแหน่งที่โค้ดอ่านค่า |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | การ Deploy ผ่าน Docker Compose, Caddy Reverse Proxy, Native systemd, Networking, Production Scaling |
| [TESTING.md](./TESTING.md) | กลยุทธ์การทดสอบ: Vitest (Server, Web, Workflow), Native C++ clang++ runner (Arduino SDK), Mocking |
| [FLOWS.md](./FLOWS.md) | Trace การทำงาน 9 Flows หลักอย่างละเอียด ตั้งแต่ต้นทาง ผ่าน Symbol ต่าง ๆ จนถึงปลายทาง |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | ปัญหาที่ตรวจพบ: ความขัดแย้งของ Docs เดิม, Stale Code, ข้อจำกัดทางสถาปัตยกรรม และจุดที่ต้องระวัง |

---

## 3. แนะนำลำดับการอ่านตามบทบาท (Reading Pathways)

### สำหรับผู้ที่ต้องการเข้าใจ Architecture อย่างรวดเร็ว (30 นาที)
1. [README.md](./README.md) (หน้านี้)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [FLOWS.md](./FLOWS.md)
4. [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)

### สำหรับ Developer ใหม่ (Onboarding)
1. [ARCHITECTURE.md](./ARCHITECTURE.md) — ทำความเข้าใจภาพรวมและบทบาทของแต่ละโปรเซส
2. [CODEBASE_MAP.md](./CODEBASE_MAP.md) — รู้ตำแหน่งไฟล์และการแบ่งโมดูล
3. [CONFIGURATION.md](./CONFIGURATION.md) — ตั้งค่า environment variables สำหรับ dev environment
4. [FLOWS.md](./FLOWS.md) — ศึกษา flow การทำงานจริง
5. [TESTING.md](./TESTING.md) — รันชุดทดสอบเพื่อยืนยันสภาพแวดล้อม

### สำหรับ Frontend Developer
1. [FRONTEND.md](./FRONTEND.md) — โครงสร้าง React Router v7, SSR, BFF Proxy, UI components
2. [REALTIME.md](./REALTIME.md) — การเชื่อมต่อ WebSocket (`useDashboardRealtime`) และ SSE fallback
3. [API.md](./API.md) — สัญญาการเรียก API และ Typesafe Hono RPC client
4. `apps/web/src/routes/dashboards/widgets/registry.ts` และ [FRONTEND.md (Dashboard Subsystem)](./FRONTEND.md#6-dashboard-subsystem-architecture)

### สำหรับ Backend / IoT Developer
1. [BACKEND.md](./BACKEND.md) — Hono application structure, DI, services
2. [TELEMETRY.md](./TELEMETRY.md) — RLP v1 binary protocol, Handshake, Channel multiplexing
3. [AUTOMATION.md](./AUTOMATION.md) — Durable execution engine, Step checkpoints, Redis streams
4. [DATABASE.md](./DATABASE.md) — Prisma schema, TimescaleDB, Migration & Concurrency locks
5. [AUTH.md](./AUTH.md) — ระบบความปลอดภัย, Session, Hardware tokens

### สำหรับ DevOps / SRE
1. [DEPLOYMENT.md](./DEPLOYMENT.md) — Docker Compose, Caddyfile, systemd native units
2. [CONFIGURATION.md](./CONFIGURATION.md) — ตัวแปรคอนฟิกทั้งหมด, Security secrets, Ports
3. [ARCHITECTURE.md (Runtime Architecture)](./ARCHITECTURE.md#4-runtime-architecture--processes) — พฤติกรรมการสเกลโพรเซส (API vs Worker vs Gateway)
4. [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — ข้อจำกัดและจุดเสี่ยงที่ต้องเฝ้าระวังในการปฏิบัติงาน
