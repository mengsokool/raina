# Representative Execution Flows

เอกสารนี้รวบรวมและ Trace ลำดับการทำงาน (Execution Flows) ที่สำคัญที่สุด 9 รายการของ Raina ตั้งแต่ Entry Point ผ่าน Function, Class, Service, Database จนถึงปลายทางจริง โดยอ้างอิง Symbol และ Repo-relative File Path อย่างแม่นยำ

---

## Flow 1: User Login (การเข้าสู่ระบบของผู้ใช้)

```mermaid
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant UI as Login Page<br/><code>apps/web/src/routes/auth/login.tsx</code>
    participant BFF as Web BFF Route<br/><code>apps/web/src/routes/auth/session.ts</code>
    participant Server as Hono Server<br/><code>apps/server/src/modules/identity/identity.routes.ts</code>
    participant DB as PostgreSQL (Prisma)

    User->>UI: กรอก username/email และ password แล้วกด "Sign in"
    UI->>BFF: POST /auth/session { identifier, password }
    BFF->>Server: POST /v1/auth/sign-in
    Note over Server: checkLoginRateLimit(ip) (10 req/min)
    Server->>DB: prisma.user.findFirst({ where: { OR: [username, email] } })
    Server->>DB: prisma.account.findFirst({ where: { userId, providerId: 'credential' } })
    Note over Server: verifyPassword(password, account.password)<br/>scryptSync + timingSafeEqual
    Server->>DB: prisma.session.create({ token, userId, expiresAt: +30d })
    Server->>DB: prisma.user.update({ lastLoginAt: now })
    Server-->>BFF: 200 OK { user, token }
    Note over BFF: sessionCookie(token, request)<br/>เซ็ต __Host-raina_session คุกกี้
    BFF-->>UI: 200 OK { user } (พร้อม Set-Cookie)
    UI->>User: Redirect ไปยังหน้า /projects
```

1. **Entry Point**: `apps/web/src/routes/auth/login.tsx` — Event Handler `handleSubmit`
2. **BFF Endpoint**: `apps/web/src/routes/auth/session.ts` — ฟังก์ชัน `action` ส่งต่อไปยัง Backend
3. **Backend Route**: `apps/server/src/modules/identity/identity.routes.ts` — ฟังก์ชัน `handleSignIn`
4. **Rate Limiting**: `checkLoginRateLimit(ip)` ป้องกัน Brute-force
5. **Credential Verification**: `verifyPassword` เปรียบเทียบ Scrypt Hash ด้วย Constant-Time
6. **Session Creation**: `prisma.session.create` บันทึก Session Token สุ่ม 64 ตัวอักษร
7. **Cookie Packaging**: `sessionCookie` ใน `apps/web/src/lib/bff-session.server.ts` กำหนดค่า `HttpOnly`, `SameSite=Lax`, `Secure`
8. **Final State**: ผู้ใช้เข้าสู่ระบบสำเร็จ คุกกี้ถูกบันทึกในเบราว์เซอร์

---

## Flow 2 & 3: User Opens Dashboard & Loads Data (เปิดแดชบอร์ดและโหลดข้อมูล)

```mermaid
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant RR_Server as Web SSR Server<br/><code>apps/web/src/routes/dashboards/view.tsx</code>
    participant Server as Backend API<br/><code>apps/server/src/modules/dashboards</code>
    participant Cache as Redis Series Cache<br/><code>apps/server/src/modules/dashboards/dashboard-series.service.ts</code>
    participant DB as PostgreSQL (Prisma)
    participant Browser as Browser Client

    User->>RR_Server: GET /p/:proj/dashboards/:id (มีคุกกี้ __Host-raina_session)
    Note over RR_Server: clientLoader()<br/><code>apps/web/src/lib/server-loaders.ts</code>
    RR_Server->>Server: GET /v1/dashboards/:id (x-session-token: TOKEN)
    Server->>DB: prisma.dashboard.findFirst()
    Server->>DB: verifyDashboardAccess()
    Server-->>RR_Server: 200 OK (Dashboard JSON + Layout)
    RR_Server-->>Browser: SSR HTML Response (Render Dashboard Skeleton)

    Note over Browser: useDashboardRealtime Hook ทำงาน<br/><code>apps/web/src/hooks/useDashboardRealtime.ts</code>
    Browser->>Server: POST /v1/auth/ws-ticket
    Server-->>Browser: { ticket }
    Browser->>Server: WebSocket Connect wss://.../v1/dashboards/:id/ws<br/>(Subprotocol: raina-ticket.TICKET)
    Note over Server: dashboardWsHandler (onOpen)<br/><code>dashboards.ws.ts</code>
    Server->>Cache: loadDashboardSeries(projectId, variableKeys)
    alt Cache Hit ใน Redis
        Cache-->>Server: Series Data (300 points)
    else Cache Miss
        Server->>DB: PostgreSQL SQL Window Function คิวรี 300 จุด
        Server->>Cache: บันทึก Cache ลง Redis (TTL 15s)
    end
    Server-->>Browser: ws.send({ type: "snapshot", variables, series })
    Note over Browser: อัปเดตกราฟและเกจวัดด้วยข้อมูลจริงทันที
```

1. **Entry Point**: ผู้ใช้เรียก URL `/p/:proj/dashboards/:id`
2. **SSR Loader**: `clientLoader` ใน `apps/web/src/routes/dashboards/view.tsx` เรียก `getDashboard()`
3. **Backend Resolver**: `getDashboardById` ใน `apps/server/src/modules/dashboards/dashboards.routes.ts`
4. **WebSocket Connect**: `useDashboardRealtime` ใน `apps/web/src/hooks/useDashboardRealtime.ts` ขอตั๋วและเปิด WebSocket
5. **Series Query**: `loadDashboardSeries` ใน `apps/server/src/modules/dashboards/dashboard-series.service.ts` คิวรี่ฐานข้อมูลและเช็คแคช Redis
6. **Snapshot Delivery**: ส่งก้อน JSON Snapshot เข้ามาทาง Socket และ Recharts/WidgetDispatcher แสดงผลบนหน้าจอ

---

## Flow 4: Device Connects to System (อุปกรณ์เชื่อมต่อผ่าน RLP)

```mermaid
sequenceDiagram
    autonumber
    actor MCU as ESP32 (Raina SDK)
    participant GW as RLP Gateway Server<br/><code>apps/server/src/rlp-gateway.ts</code>
    participant Redis as Redis Leases
    participant DB as PostgreSQL (Prisma)

    MCU->>GW: TCP Connect (:9000) หรือ TLS Connect (:8883)
    Note over MCU: Raina.run() -> sendHello()<br/><code>sdks/arduino/src/Raina.cpp</code>
    MCU->>GW: ไบนารีเฟรม HELLO (Type 1)<br/>[Ver: 1, DeviceId: "esp32", Credential: TOKEN, Capabilities: JSON]
    Note over GW: authenticate(hello)<br/><code>apps/server/src/rlp-gateway.ts</code>
    GW->>DB: prisma.projectToken.findUnique({ where: { hash: sha256(token) } })
    GW->>Redis: claimLease("esp32") -> SET raina:rlp:device:esp32 GATEWAY_ID PX 45000 NX
    GW->>DB: getOrCreateDefaultDevice(projectId, "esp32", tokenId)
    GW->>DB: registerChannels(projectId, deviceId, channels)
    GW-->>MCU: ไบนารีเฟรม WELCOME (Type 2)
    Note over MCU: _welcomed = true<br/>สถานะออนไลน์พร้อมส่ง Telemetry
    GW->>GW: broadcastEvent({ type: "device_status", status: "online" })
```

1. **Entry Point**: ไมโครคอนโทรลเลอร์บูตขึ้นมา เรียก `Raina.begin()` และ `Raina.run()` ใน `sdks/arduino/src/Raina.cpp`
2. **RLP Framing**: `sendHello()` ส่ง Packet ชนิด `HELLO` (Type 1)
3. **Gateway Verification**: `authenticate()` ใน `apps/server/src/rlp-gateway.ts` ตรวจสอบ Token Hash
4. **Distributed Lease**: `claimLease()` ใน Redis ผูกอุปกรณ์เข้ากับ Gateway ID ปัจจุบัน
5. **Channel Registration**: `registerChannels()` ผูกเลข Channel ตัวเลขเข้ากับชื่อตัวแปรใน DB
6. **Handshake Completion**: Gateway ตอบกลับเฟรม `WELCOME` และกระจายสถานะ `online` เข้า Realtime Bus

---

## Flow 5, 6 & 7: Telemetry Ingested, Persisted, and Delivered Realtime

```mermaid
sequenceDiagram
    autonumber
    actor MCU as ESP32 Device
    participant GW as RLP Gateway<br/><code>apps/server/src/rlp-gateway.ts</code>
    participant Core as Central Service<br/><code>apps/server/src/services/telemetry.service.ts</code>
    participant DB as PostgreSQL + TimescaleDB
    participant Bus as Realtime Bus<br/><code>apps/server/src/lib/events.ts</code>
    participant WS as WebSocket Handler<br/><code>modules/dashboards/dashboards.ws.ts</code>
    participant UI as Dashboard UI (Browser)

    MCU->>GW: ส่งเฟรม BATCH (Type 4) Channel 1 = 28.5 (Float64)
    GW->>Core: processTelemetryPayload({ projectId, metrics: { temperature: 28.5 } })
    Note over Core: sanitizeTimestamp()<br/>shouldUpdateDeviceLastSeen()
    
    par บันทึกลงฐานข้อมูลแบบขนาน
        Core->>DB: prisma.projectVariable.upsert(value="28.5")
        Core->>DB: prisma.telemetry.createMany(value=28.5, timestamp=now)
    and ส่งข้อมูลเข้า Realtime Bus ทันที (0ms latency)
        Core->>Bus: broadcastTelemetry({ variable: "temperature", value: 28.5 })
        Bus->>WS: eventBus.emit("project:ID", event)
        WS-->>UI: ws.send({ type: "telemetry", variable: "temperature", value: 28.5 })
        Note over UI: กราฟ Recharts ขยับและ Gauge ปรับเข็มทันที
    and ส่งงานเข้า Automation Queue
        Core->>Core: enqueueAutomationEvaluation({ variableKey: "temperature", value: 28.5 })
    end
```

1. **Entry Point**: ข้อมูลเซนเซอร์ถูกส่งเข้ามาผ่าน RLP Socket หรือ `POST /v1/telemetry`
2. **Central Processing**: `processTelemetryPayload()` ใน `apps/server/src/services/telemetry.service.ts`
3. **Data Persistence**:
   - `ProjectVariable.upsert`: บันทึกค่าล่าสุดสำหรับ State แสดงผล
   - `Telemetry.createMany`: บันทึกลง TimescaleDB Hypertable
4. **Realtime Fan-out**: `broadcastTelemetry()` ใน `apps/server/src/lib/events.ts` ส่งไปยัง WebSocket และ SSE ของเบราว์เซอร์
5. **UI Rendering**: วิดเจ็ต `IotValue`, `IotGauge`, `IotChart` บนแดชบอร์ดอัปเดตแบบไร้รอยต่อ

---

## Flow 8 & 9: Automation Triggered and Integration Executed

```mermaid
sequenceDiagram
    autonumber
    participant Telemetry as Telemetry Service
    participant Queue as Automation Queue<br/><code>apps/server/src/lib/automation-queue.ts</code>
    participant Worker as Worker Consumer<br/><code>apps/server/src/lib/automation-queue.ts</code>
    participant Engine as Workflow Engine<br/><code>apps/server/src/lib/engine.ts</code>
    participant Action as Action Executor<br/><code>apps/server/src/lib/automation-action-executors.ts</code>
    participant DB as PostgreSQL (Prisma)
    participant Telegram as Telegram Cloud API

    Telemetry->>Queue: enqueueAutomationEvaluation({ variable: "temperature", value: 38.5 })
    Note over Queue: XADD raina:automation:evaluations
    Worker->>Queue: XREADGROUP consumer raina-automation-workers
    Worker->>Engine: evaluateVariableAutomations() -> executeAutomation()
    
    Engine->>DB: สร้าง AutomationRun (status: 'running')
    Note over Engine: ตรวจสอบ Trigger Block: temperature > 30 (ตรงเงื่อนไข)
    Engine->>DB: สร้าง AutomationStepRun (Trigger 'completed')
    
    Note over Engine: รัน Block ถัดไป: call_integration (Telegram)
    Engine->>Action: executeActionNode(call_integration)
    Action->>DB: ค้นหา Integration และถอดรหัสลับด้วย openIntegrationConfig()
    Note over Action: retryWithBackoff (Max 3 attempts)
    Action->>Telegram: POST https://api.telegram.org/botTOKEN/sendMessage<br/>{"chat_id": 12345, "text": "temperature alert: 38.5"}
    Telegram-->>Action: 200 OK
    Action-->>Engine: { status: 'ok', detail: 'Telegram executed' }
    
    Engine->>DB: บันทึก AutomationStepRun (Action 'completed')
    Engine->>DB: อัปเดต AutomationRun (status: 'completed', durationMs)
    Engine->>DB: อัปเดต Automation (lastRunAt, lastRunStatus: 'ok')
    Worker->>Queue: XACK raina:automation:evaluations ID
```

1. **Trigger Phase**: ค่าอุณหภูมิใหม่ทำให้เกิดการเรียก `enqueueAutomationEvaluation()`
2. **Queueing**: ส่งเข้า Redis Streams `raina:automation:evaluations`
3. **Execution**: Worker ดึงงานและเรียก `executeAutomation()` ใน `apps/server/src/lib/engine.ts`
4. **Step Checkpointing**: บันทึกสถานะแต่ละก้าวลงตาราง `AutomationStepRun`
5. **Integration Invocation**: `callIntegration` ใน `apps/server/src/lib/automation-action-executors.ts` ถอดรหัสลับและส่งข้อความแจ้งเตือนผ่าน Telegram API จริง
6. **Run Completion**: ปิดรอบการรันด้วยสถานะ `completed` และยืนยัน ACK ใน Redis Streams
