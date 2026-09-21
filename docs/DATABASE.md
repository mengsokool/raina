# Database & Persistence Architecture

เอกสารนี้อธิบายสถาปัตยกรรมข้อมูล การจัดเก็บถาวร (Persistence Layer) โครงสร้างเอนทิตี และการบริหารจัดการ TimescaleDB Hypertable ของระบบ Raina

---

## 1. Database Engine & ORM Layer

- **Database Engine**: **PostgreSQL 17** ร่วมกับ **TimescaleDB Extension 2.30.0** (`timescale/timescaledb:2.30.0-pg17`)
- **ORM / Query Engine**: **Prisma ORM Client 6.4.1** (`packages/db`)
- **Connection Management**:
  - `packages/db/src/index.ts`: ส่งออกอินสแตนซ์ Singleton ของ `PrismaClient` พร้อมกลไกป้องกัน Connection Leaks ใน Node.js Hot-reload environment (`globalForPrisma.prisma`)
  - คอนฟิกการเชื่อมต่อผ่านตัวแปร `DATABASE_URL` (เช่น `postgresql://raina:rainasecret@127.0.0.1:5432/raina?schema=public`)

---

## 2. Entity-Relationship Model (Core Entities)

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : maintains
    User ||--o{ ProjectMember : belongs_to
    User ||--o{ Project : creates
    User ||--o{ Dashboard : creates
    User ||--o{ Automation : creates
    User ||--o{ DashboardAccess : granted

    Project ||--o{ ProjectMember : has
    Project ||--o{ Device : owns
    Project ||--o{ ProjectVariable : defines
    Project ||--o{ ProjectToken : issues
    Project ||--o{ Dashboard : contains
    Project ||--o{ Automation : configures
    Project ||--o{ Integration : configures
    Project ||--o{ Telemetry : collects
    Project ||--o{ AuditLog : records

    Device ||--o{ ProjectVariable : reports
    Device ||--o{ Telemetry : generates
    ProjectToken ||--o{ Device : authenticates

    Dashboard ||--o{ DashboardAccess : controls

    Automation ||--o{ AutomationRun : executes
    Automation ||--o{ AutomationDelay : schedules
    AutomationRun ||--o{ AutomationStepRun : logs
    AutomationRun ||--o{ AutomationDelay : tracks
```

---

## 3. Schema & Models Breakdown

### 3.1 กลุ่ม Identity & Authentication
- **`users` (`User`)**: ข้อมูลผู้ใช้, อีเมล, ชื่อผู้ใช้, สถานะบทบาท (`role: owner | admin | staff | client`), `lastLoginAt`
- **`accounts` (`Account`)**: ข้อมูลการยืนยันตัวตน (`providerId: "credential"`), เก็บ Hash รหัสผ่าน (`password`)
- **`sessions` (`Session`)**: บันทึกโทเค็น Session ปัจจุบัน (ความยาว 64 hex characters), วันหมดอายุ (`expiresAt`), ข้อมูล IP และ User-Agent

### 3.2 กลุ่ม Project & Access Control
- **`projects` (`Project`)**: ขอบเขตโปรเจกต์ (Multi-Tenancy Boundary) มีฟิลด์ `archivedAt` สำหรับ Soft Delete
- **`project_members` (`ProjectMember`)**: การจับคู่ User กับ Project, กำหนดบทบาทในโปรเจกต์ (`role: admin | member | client`), แฟล็ก `accessAllDashboards`
- **`project_tokens` (`ProjectToken`)**: โทเค็นฮาร์ดแวร์สำหรับอุปกรณ์ IoT บันทึกเป็น SHA-256 Hash (`hash: String @unique`)
- **`dashboards` (`Dashboard`)**: การตั้งค่าหน้าแดชบอร์ด, Layout JSON (ขนาดและตำแหน่งวิดเจ็ต), การเปิดเผย (`visibility: private | public | disabled | users_only`), `shareToken` สำหรับ Public Link
- **`dashboard_access` (`DashboardAccess`)**: สิทธิ์เฉพาะรายแดชบอร์ดสำหรับผู้ใช้ภายนอก พร้อมแฟล็ก `canControl` ควบคุมการสั่งการ

### 3.3 กลุ่ม IoT & Telemetry Storage
- **`devices` (`Device`)**: ข้อมูลอุปกรณ์ (Hardware ID, Name, Device Key, Chip, Firmware Version, First/Last Seen)
- **`project_variables` (`ProjectVariable`)**: เก็บ **ค่าล่าสุด (Latest State)** ของแต่ละตัวแปรเพื่อใช้แสดงผลแดชบอร์ดและประเมิน Automation:
  - Unique Constraint: `@@unique([projectId, deviceId, key])`
  - Unique Constraint: `@@unique([projectId, deviceId, rlpChannel])` — คีย์สำหรับแมปเลขแชนแนล RLP v1
- **`telemetry` (`Telemetry`)**: บันทึก **ข้อมูลประวัติอนุกรมเวลา (Time-Series Historical Data)** สำหรับใช้วาดกราฟ

### 3.4 กลุ่ม Workflow & Auditing
- **`automations` (`Automation`)**: นิยาม Graph JSON, Trigger Type, Trigger Kinds, Enabled flag, สถิติการรันล่าสุด
- **`automation_runs` (`AutomationRun`)**: บันทึกการรันแต่ละรอบ, Trigger Source, Snapshot Context, Status, เวลาเริ่ม/สิ้นสุด, Duration
- **`automation_step_runs` (`AutomationStepRun`)**: บันทึก Checkpoint แต่ละ Node ใน Graph (Status, Input, Output, Retries, Duration)
- **`automation_delays` (`AutomationDelay`)**: บันทึกงานหน่วงเวลาที่รอให้ Scheduler ปลุกขึ้นมาทำต่อ
- **`integrations` (`Integration`)**: คอนฟิกการเชื่อมต่อภายนอก (Sealed ด้วย AES-256-GCM)
- **`audit_log` (`AuditLog`)**: บันทึก Audit Trail การกระทำสำคัญของผู้ใช้ในระบบ

---

## 4. TimescaleDB Telemetry Architecture

ไฟล์ `packages/db/src/timescale.ts` จัดการตั้งค่าตาราง `telemetry` ให้เป็น TimescaleDB Hypertable โดยอัตโนมัติ:

### 4.1 Wire Format Compatibility & BigInt Timestamp
- Raina ไม่ใช้คอลัมน์ชนิด `TIMESTAMPTZ` แต่ใช้ **`BigInt` (Unix milliseconds)** เป็นค่า `timestamp`
- **เหตุผล**: ทำให้อุปกรณ์ฮาร์ดแวร์ขนาดเล็ก (เช่น ESP32) และ REST API สามารถส่งและรับเวลาเป็นตัวเลข Unix millisecond ได้โดยตรง โดยไม่ต้องคำนวณแปลงสตริง ISO-8601
- ใน PostgreSQL มีการประกาศฟังก์ชันระบุเวลาปัจจุบันสำหรับ Hypertable:
  ```sql
  CREATE OR REPLACE FUNCTION public.raina_telemetry_now()
  RETURNS BIGINT
  LANGUAGE SQL
  STABLE
  AS $$ SELECT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT $$;

  SELECT set_integer_now_func('telemetry', 'raina_telemetry_now', replace_if_exists => TRUE);
  ```

### 4.2 Composite Primary Key
- TimescaleDB กำหนดว่า Unique constraints และ Primary Key ทุกตัวจะต้องมีคอลัมน์ที่ใช้ทำ Partitioning รวมอยู่ด้วย
- ตาราง `telemetry` จึงใช้ Composite Primary Key:
  ```prisma
  @@id([id, timestamp])
  ```

### 4.3 Partition Chunks & Retention Policy
- ตารางถูกแบ่งพาร์ติชันช่วงเวลาละ 1 วัน (86,400,000 มิลลิวินาที):
  ```sql
  SELECT create_hypertable('telemetry', by_range('timestamp', 86400000::bigint), migrate_data => TRUE, if_not_exists => TRUE);
  ```
- มีการสร้าง Data Retention Policy ตามตัวแปร `TELEMETRY_RETENTION_DAYS` (ค่าเริ่มต้น 30 วัน):
  ```sql
  SELECT add_retention_policy('telemetry', 2592000000::bigint, if_not_exists => TRUE);
  ```
- **ข้อดี**: TimescaleDB จะทำ Drop Chunks ระดับไฟล์ของทั้งวันทิ้งทันทีเมื่อหมดอายุ โดยไม่ต้องใช้คำสั่ง `DELETE FROM ... WHERE` ซึ่งช้าและเกิด Table Lock contention

---

## 5. Query Optimization & Caching Strategy

### 5.1 Dashboard Multi-Series Query Window Function
เพื่อแก้ปัญหา N+1 Query เมื่อหน้าจอแดชบอร์ดมีหลายตัวแปร (เช่น 10 กราฟบนหน้าจอเดียว) ฟังก์ชัน `loadDashboardSeries()` ใน `apps/server/src/modules/dashboards/dashboard-series.service.ts` ใช้ **SQL Window Function** ดึงข้อมูล 300 จุดล่าสุดของทุกตัวแปรในคิวรีเดียว:

```sql
SELECT variable_key, timestamp, value
FROM (
  SELECT variable_key, timestamp, value,
    ROW_NUMBER() OVER (PARTITION BY variable_key ORDER BY timestamp DESC) AS row_number
  FROM telemetry
  WHERE project_id = $1 AND variable_key IN ($2, $3, ...)
) latest
WHERE row_number <= 300
ORDER BY variable_key ASC, timestamp ASC;
```

### 5.2 Short-Lived Redis Series Cache
- ผลลัพธ์ของคิวรีข้างต้นจะถูกนำไปแคชไว้ใน Redis เป็นเวลา **15 วินาที** (`SERIES_CACHE_TTL_SECONDS = 15`)
- คีย์แคช: `raina:dashboard-series:<projectId>:<sha256_hash_of_keys>`
- ช่วยป้องกันการยิงคิวรี่ซ้ำ ๆ ใส่ฐานข้อมูลเมื่อมีผู้ใช้งานหลายคนเปิดแดชบอร์ดหน้าเดียวกันพร้อมกัน

---

## 6. Concurrency & Transaction Boundaries

| สถานการณ์ | กลไกความปลอดภัยและ Concurrency Control |
| :--- | :--- |
| **First Owner Bootstrap** | `SELECT pg_advisory_xact_lock(73461825)` — ล็อกระดับทรานแซกชันเพื่อรับประกันว่าจะมี Owner ถูกสร้างเพียงคนเดียว แม้มีคำขอยิงเข้ามาพร้อมกัน |
| **Timescale Migration** | `SELECT pg_advisory_xact_lock(6184202026)` — ป้องกัน Race condition เมื่อหลายโพรเซส (เช่น API Replica และ Worker) เริ่มทำงานพร้อมกัน |
| **Scheduler Tick** | `withDistributedLock("raina:scheduler:tick", 9000, ...)` ผ่าน Redis SET NX PX |
| **Device Connection Leases** | Redis Lua Script (`claimLease`) ป้องกัน Gateway สองตัวรับอุปกรณ์เดียวกันซ้ำซ้อน |
| **Device Auto-Provisioning** | ใช้ `upsert` ร่วมกับ `findFirst` Fallback ดักจับ Conflict จากไมโครคอนโทรลเลอร์ที่ส่งข้อมูลครั้งแรกพร้อมกันหลาย Core |
