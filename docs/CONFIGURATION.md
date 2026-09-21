# System Configuration & Environment Variables

เอกสารนี้รวบรวมตัวแปรสภาพแวดล้อม (Environment Variables) และค่าคอนฟิกทั้งหมดของระบบ Raina จัดหมวดหมู่ตามหน้าที่ พร้อมระบุไฟล์โค้ดที่อ่านค่า และค่าเริ่มต้น (Default Value)

---

## 1. Runtime & Server Configuration

| ตัวแปร | ความสำคัญ | จำเป็น? | ค่าเริ่มต้น | ไฟล์ที่อ่านค่า | หน้าที่และการทำงาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | สูง | ไม่บังคับ | `development` | `apps/server/src/config.ts` | ระบุโหมดการทำงาน (`development`, `production`, `test`) |
| **`PORT`** | ปานกลาง | ไม่บังคับ | `3001` (server)<br/>`3000` (web) | `apps/server/src/config.ts` | พอร์ตสำหรับเปิดรับการเชื่อมต่อ HTTP |
| **`CORS_ORIGIN`** | สูง | ไม่บังคับ | `localhost:3000, 3001` | `apps/server/src/config.ts` | รายชื่อ Origins ที่อนุญาตให้เรียก API (คั่นด้วยจุลภาค `,` หรือ `*`) |
| **`PUBLIC_API_URL`** | สูง | ไม่บังคับ | ว่างเปล่า | `apps/server/src/config.ts` | URL หลักภายนอกของ API (เช่น `https://iot.example.com`) ใช้ตัดสินใจเรื่อง Cookie Secure |
| **`COOKIE_DOMAIN`** | ปานกลาง | ไม่บังคับ | ว่างเปล่า | `apps/server/src/config.ts` | กำหนด Domain สำหรับ Session Cookie กรณีแชร์คุกกี้ข้าม Subdomains |

---

## 2. Database & TimescaleDB Configuration

| ตัวแปร | ความสำคัญ | จำเป็น? | ค่าเริ่มต้น | ไฟล์ที่อ่านค่า | หน้าที่และการทำงาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`DATABASE_URL`** | สูงมาก | **จำเป็น** | — | `packages/db/prisma/schema.prisma`<br/>`apps/server/src/config.ts` | Connection String สำหรับเชื่อมต่อไปยัง PostgreSQL 17 |
| **`TIMESCALE_ENABLED`** | สูง | ไม่บังคับ | `true` | `packages/db/src/timescale.ts`<br/>`apps/server/src/config.ts` | เปิดใช้งาน TimescaleDB Hypertable สำหรับจัดเก็บข้อมูล Telemetry |
| **`TELEMETRY_RETENTION_DAYS`** | ปานกลาง | ไม่บังคับ | `30` | `packages/db/src/timescale.ts`<br/>`apps/server/src/services/scheduler.service.ts` | จำนวนวันที่เก็บข้อมูลประวัติ Telemetry (0 คือเก็บตลอดไป) |
| **`AUTO_MIGRATE`** | ปานกลาง | ไม่บังคับ | `true` | `apps/server/scripts/entrypoint.sh` | สั่งรัน `prisma db push` และตั้งค่า Timescale อัตโนมัติเมื่อคอนเทนเนอร์เริ่มทำงาน |
| **`AUTO_SEED`** | ต่ำ | ไม่บังคับ | `false` | `apps/server/scripts/entrypoint.sh` | สั่งรัน Seed ข้อมูลจำลอง Smart Farm ตัวอย่างเมื่อสร้างระบบครั้งแรก |
| **`POSTGRES_USER`** | ปานกลาง | ไม่บังคับ | `raina` | `docker-compose.yml` | ชื่อ User ของ PostgreSQL ในคอนเทนเนอร์ Docker |
| **`POSTGRES_PASSWORD`** | สูงมาก | **จำเป็นใน Prod** | `rainasecret` | `docker-compose.yml` | รหัสผ่านสำหรับฐานข้อมูล PostgreSQL |
| **`POSTGRES_DB`** | ปานกลาง | ไม่บังคับ | `raina` | `docker-compose.yml` | ชื่อฐานข้อมูล PostgreSQL |
| **`POSTGRES_PORT`** | ต่ำ | ไม่บังคับ | `5432` | `docker-compose.yml` | พอร์ตของ PostgreSQL บน Host |

---

## 3. Redis Configuration

| ตัวแปร | ความสำคัญ | จำเป็น? | ค่าเริ่มต้น | ไฟล์ที่อ่านค่า | หน้าที่และการทำงาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`REDIS_ENABLED`** | สูงมาก | ไม่บังคับ | `false` (Dev)<br/>`true` (Prod) | `apps/server/src/config.ts` | เปิดใช้ Redis สำหรับ Pub/Sub, Distributed Lock, และ Streams |
| **`REDIS_URL`** | สูง | ไม่บังคับ | `redis://127.0.0.1:6379` | `apps/server/src/config.ts` | URL การเชื่อมต่อไปยัง Redis Broker |
| **`REDIS_PORT`** | ต่ำ | ไม่บังคับ | `6379` | `docker-compose.yml` | พอร์ตของ Redis บน Host |

---

## 4. Security & Cryptographic Secrets

| ตัวแปร | ความสำคัญ | จำเป็น? | ค่าเริ่มต้น | ไฟล์ที่อ่านค่า | หน้าที่และการทำงาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ENCRYPTION_KEY`** | สูงสุด | **จำเป็นใน Prod** | ค่าสุ่มชั่วคราวใน Dev | `apps/server/src/lib/crypto.ts` | Master Secret Key สำหรับอัลกอริทึม HKDF-AES-256-GCM ใช้เข้ารหัส Credentials ของ Integrations |
| **`WS_TICKET_SECRET`** | สูงสุด | **จำเป็นใน Prod** | ว่างเปล่า | `apps/server/src/lib/ws-ticket.ts` | คีย์ลับสำหรับเซ็น HMAC-SHA256 ลงในตั๋ว WebSocket ของหน้าจอแดชบอร์ด |
| **`JWT_SECRET`** | สูง | ไม่บังคับ | ว่างเปล่า | `apps/server/src/config.ts` | คีย์สำรอง (Fallback) หากไม่ได้ตั้ง `ENCRYPTION_KEY` หรือ `WS_TICKET_SECRET` |
| **`SETUP_TOKEN`** | สูงมาก | **จำเป็นใน Prod** | ว่างเปล่า | `apps/server/src/modules/identity/identity.routes.ts` | โทเค็นลับที่ต้องระบุตอนสร้างบัญชี System Owner คนแรกในโหมด Production |

---

## 5. RLP Device Gateway Configuration

| ตัวแปร | ความสำคัญ | จำเป็น? | ค่าเริ่มต้น | ไฟล์ที่อ่านค่า | หน้าที่และการทำงาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`RLP_HOST`** | ปานกลาง | ไม่บังคับ | `0.0.0.0` | `apps/server/src/config.ts` | IP Interface ที่ RLP Gateway จะเปิดรับฟัง Socket |
| **`RLP_PORT`** | ปานกลาง | ไม่บังคับ | `9000` | `apps/server/src/config.ts` | พอร์ต TCP ที่ RLP Gateway เปิดรับฟัง Socket ในเครื่อง |
| **`PUBLIC_RLP_HOST`** | สูง | ไม่บังคับ | `127.0.0.1` | `apps/server/src/config.ts` | Hostname หรือ Public IP ที่ประชาสัมพันธ์ให้อุปกรณ์ไมโครคอนโทรลเลอร์เชื่อมต่อ |
| **`PUBLIC_RLP_PORT`** | สูง | ไม่บังคับ | `9000` (หรือ `8883` ถ้า HTTPS) | `apps/server/src/config.ts` | พอร์ตภายนอกที่ประชาสัมพันธ์ให้ฮาร์ดแวร์ต่อ |
| **`PUBLIC_RLP_TLS`** | สูง | ไม่บังคับ | `false` (Dev) | `apps/server/src/config.ts` | ประชาสัมพันธ์ว่าพอร์ตภายนอกเป็น TLS (`rlps://`) หรือไม่ |
| **`RLP_REQUIRE_TLS`** | สูงมาก | ไม่บังคับ | `true` ใน Prod | `apps/server/src/config.ts` | บังคับให้การเชื่อมต่อ RLP ต้องใช้การเข้ารหัส TLS เท่านั้น |
| **`RLP_TLS_CERT_PATH`** | สูง | มีเงื่อนไข | ว่างเปล่า | `apps/server/src/rlp-gateway.ts` | Path ไฟล์ Server TLS Certificate (`server.crt`) |
| **`RLP_TLS_KEY_PATH`** | สูง | มีเงื่อนไข | ว่างเปล่า | `apps/server/src/rlp-gateway.ts` | Path ไฟล์ Server TLS Private Key (`server.key`) |
| **`RLP_REQUIRE_REDIS`** | สูง | ไม่บังคับ | `true` | `apps/server/src/rlp-gateway.ts` | บังคับให้ต้องมี Redis เพื่อใช้ในการกระจาย Command ไปหา Socket ของอุปกรณ์ |
| **`RLP_DEVICE_LEASE_MS`** | ปานกลาง | ไม่บังคับ | `45000` | `apps/server/src/rlp-gateway.ts` | อายุ Lease ของอุปกรณ์ที่เชื่อมต่ออยู่ (มิลลิวินาที, ขั้นต่ำ 15000) |
| **`RLP_MAX_CONNECTIONS`** | ปานกลาง | ไม่บังคับ | `10000` | `packages/rlp/src/index.ts` | ขีดจำกัดจำนวนการเชื่อมต่อฮาร์ดแวร์พร้อมกันสูงสุดต่อหนึ่ง Gateway Node |
| **`RLP_MAX_FRAME_SIZE`** | ปานกลาง | ไม่บังคับ | `16384` (16 KB) | `packages/rlp/src/index.ts` | ขนาดสูงสุดของเฟรมไบนารีที่ยอมรับได้ ป้องกัน Frame Bombing |
| **`RLP_IDLE_TIMEOUT_MS`** | ปานกลาง | ไม่บังคับ | `90000` (90 วินาที) | `packages/rlp/src/index.ts` | ตัดการเชื่อมต่อทันทีหากอุปกรณ์เงียบหายเกินเวลาที่กำหนด |

---

## 6. Background Worker & Frontend Configuration

| ตัวแปร | ความสำคัญ | จำเป็น? | ค่าเริ่มต้น | ไฟล์ที่อ่านค่า | หน้าที่และการทำงาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`SCHEDULER_ENABLED`** | ปานกลาง | ไม่บังคับ | `true` | `apps/server/src/config.ts` | เปิด/ปิดการทำงานของ Background Scheduler ใน API Node (ปิดเมื่อมี Dedicated Worker) |
| **`INTERNAL_API_URL`** | สูง | ไม่บังคับ | `http://127.0.0.1:3001` | `apps/web/src/lib/config.server.ts` | URL ของ Backend API ฝั่ง Server-to-Server ที่ Web BFF Proxy ใช้ยิงไปหา |
| **`VITE_WS_URL`** | ปานกลาง | ไม่บังคับ | ว่างเปล่า | `apps/web/src/hooks/useDashboardRealtime.ts` | กำหนด URL ของ WebSocket บนเบราว์เซอร์แบบเจาะจง (Override ค่าเริ่มต้น) |
| **`TYPESAFE_API_KEY`** | ปานกลาง | ไม่บังคับ | ว่างเปล่า | `apps/server/src/config.ts` | API Key ของ TypeSafe AI สำหรับใช้งานฟีเจอร์แปลงประโยคภาษาธรรมชาติเป็น Workflow Draft |
| **`DOMAIN`** | สูง | มีเงื่อนไข | `:80` | `Caddyfile`<br/>`docker-compose.yml` | โดเมนสาธารณะสำหรับ Caddy Reverse Proxy (เช่น `iot.example.com`) สำหรับขอ Auto-SSL |
