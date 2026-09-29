# Raina Installation and Update System (Self-Host Guide)

Raina ถูกออกแบบมาให้ผู้ใช้งานสามารถ Self-host ได้อย่างง่ายดายผ่าน single command โดยมองระบบเป็นซอฟต์แวร์ชิ้นเดียว ผู้ใช้ไม่จำเป็นต้องจัดการ Docker Compose ด้วยตนเองใน workflow ปกติ

---

## 1. Quick Installation (ติดตั้งครั้งแรก)

บนเครื่องเซิร์ฟเวอร์ Linux (Debian, Ubuntu, Rocky, Alpine) หรือ macOS ที่มี Docker และ Docker Compose พร้อมใช้งาน:

```bash
curl -fsSL https://raw.githubusercontent.com/mengsokool/raina/main/deploy/install.sh | bash
```

หรือตรวจสอบคำสั่งก่อนรัน:

```bash
curl -fsSL https://raw.githubusercontent.com/mengsokool/raina/main/deploy/install.sh -o install-raina.sh
less install-raina.sh
bash install-raina.sh
```

### ตัวเลือกเพิ่มเติม (Options)

```bash
bash install-raina.sh \
  --install-dir /opt/raina \
  --version latest \
  --channel stable \
  --port 3000 \
  --api-port 3001 \
  --rlp-port 9000
```

---

## 2. โครงสร้างไดเรกทอรีการติดตั้ง (`/opt/raina`)

```text
/opt/raina/
├── compose.yaml          # Pinned Docker Compose stack
├── .env                  # Generated secrets (POSTGRES_PASSWORD, keys, tokens)
│
├── config/               # Caddyfile / TLS Certificates
│
├── state/
│   ├── installation.json # ข้อมูลเวอร์ชัน แชนเนล สถาปัตยกรรม วันที่ติดตั้ง
│   ├── migrations.json   # ประวัติ Migration ที่รันสำเร็จ
│   └── update-state.json # สถานะการอัปเดตและเป้าหมาย rollback
│
├── data/                 # Host mount point สำหรับ persistence data
├── backups/              # ไฟล์ Snapshot สำรองข้อมูล (.tar.gz)
└── updates/              # แคช release manifests และ migration scripts
```

Raina CLI จะถูกติดตั้งไว้ที่:
```text
/usr/local/bin/raina
```
ทำให้ผู้ใช้สามารถเรียกใช้คำสั่ง `raina` จากไดเรกทอรีใดก็ได้ในเครื่อง

---

## 3. คำสั่งจัดการระบบ (Raina CLI Reference)

| คำสั่ง | คำอธิบาย |
|---|---|
| `raina install` | ติดตั้งและเริ่มต้นระบบ Raina พร้อมสร้างความปลอดภัยและ state อัตโนมัติ |
| `raina status` | ดูสถานะของทุก container, version ปัจจุบัน และผลตรวจ Live Healthcheck |
| `raina logs [-f] [service]` | ดูหรือสตรีม logs แบบเรียลไทม์ (เช่น `raina logs -f api`) |
| `raina start` | สั่งเปิดระบบ Raina services ทั้งหมด |
| `raina stop` | สั่งหยุดระบบ Raina services ทั้งหมดอย่างปลอดภัย |
| `raina restart [service]` | สั่งรีสตาร์ต service ทั้งหมด หรือเฉพาะตัวที่ระบุ |
| `raina doctor` | วินิจฉัยสภาพแวดล้อม (Docker, พื้นที่ดิสก์, สิทธิ์ไฟล์, พอร์ต, การเชื่อมต่อฐานข้อมูล) |
| `raina update` | อัปเดต Raina เป็นเวอร์ชันใหม่ พร้อมระบบสำรองข้อมูลและ Rollback อัตโนมัติ |
| `raina rollback` | ถอยกลับไปยังเวอร์ชันก่อนหน้ากรณีพบปัญหา |
| `raina backup [note]` | สำรองฐานข้อมูล PostgreSQL และไฟล์การตั้งค่า (.tar.gz) |
| `raina restore <file>` | กู้คืนฐานข้อมูลและการตั้งค่าจากไฟล์สำรอง |
| `raina version` | แสดงเวอร์ชันของ CLI และ Release ที่ติดตั้ง |

---

## 4. กระบวนการอัปเดตอย่างปลอดภัย (Safe Atomic Update)

เมื่อเรียกคำสั่ง:

```bash
raina update --version 1.1.0
```

CLI จะทำงานเป็นขั้นตอนดังนี้:
1. **Preflight Checks**: ตรวจสอบความพร้อมของระบบ
2. **Auto Backup**: สำรองฐานข้อมูลและ `.env` เก็บไว้ที่ `/opt/raina/backups/` อัตโนมัติ
3. **Record State**: บันทึกสถานะ `deploying` ลงใน `state/update-state.json`
4. **Pull & Deploy**: ดึง Container images ใหม่และรัน `docker compose up -d`
5. **Health Verification**: ตรวจสอบ endpoint `GET /health` บน API
   - **ผ่าน**: บันทึกสถานะ `completed` และอัปเดต `state/installation.json`
   - **ไม่ผ่าน / ขัดข้อง**: เริ่มระบบ **Rollback อัตโนมัติ** คืนค่ากลับเป็นเวอร์ชันเดิมทันที

---

## 5. การสำรองและกู้คืนข้อมูล (Backup & Disaster Recovery)

### สร้าง Backup
```bash
raina backup before_upgrade
```
ผลลัพธ์: จะได้ไฟล์ `.tar.gz` ภายในโฟลเดอร์ `/opt/raina/backups/` เช่น:
`/opt/raina/backups/20260926_130000_v1.0.0_before_upgrade.tar.gz`

### กู้คืนข้อมูล (Restore)
```bash
raina restore /opt/raina/backups/20260926_130000_v1.0.0_before_upgrade.tar.gz
```
ระบบจะหยุดเซอร์วิสแอปพลิเคชัน คืนค่า `.env`, `compose.yaml` และ import ฐานข้อมูล PostgreSQL กลับคืนให้อัตโนมัติ
