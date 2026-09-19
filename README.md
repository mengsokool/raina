# Raina 🌧️

<p align="center">
  <img src="./docs/assets/banner.png" alt="Raina IoT Cloud Platform" width="100%" />
</p>

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-Ready-2496ED?logo=docker&logoColor=white)](#-deploy-in-2-minutes)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql&logoColor=white)](#tech-stack)
[![MQTT](https://img.shields.io/badge/MQTT-EMQX%205-009A61?logo=eclipse-mosquitto&logoColor=white)](#tech-stack)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A modern, self-hosted IoT cloud platform for managing interactive dashboards, device telemetry, and automated workflows.

## ⚡ Deploy in 2 Minutes

Run the entire Raina stack (Web Dashboard, Backend API, PostgreSQL 17, and EMQX 5 MQTT Broker) with Docker Compose:

```bash
# 1. Clone repository
git clone https://github.com/mengsokool/raina.git
cd raina

# 2. Start the stack
docker compose up -d
```

That's it! Open **[http://localhost:3000](http://localhost:3000)** (or `http://<your-vps-or-homelab-ip>:3000`) in your browser to create the owner account and launch your first IoT dashboard.

### Default Endpoints

| Service | Address | Description |
| :--- | :--- | :--- |
| **Web Dashboard** | `http://<host>:3000` | Responsive web UI (Desktop & Mobile) |
| **API Server** | `http://<host>:3001` | Hono REST API & Realtime WebSockets |
| **MQTT Broker (TCP)** | `<host>:1883` | Direct TCP for ESP32, Arduino, Raspberry Pi |
| **MQTT Broker (WS)** | `<host>:8083` | Browser MQTT WebSocket |
| **EMQX Dashboard** | `http://<host>:18083` | EMQX Web Console (`admin` / `rainasecret`) |

---

## 🏠 Homelab vs. VPS Deployment

### 1. Homelab / Local Network (LAN)
No public domain or DNS needed. Just run `docker compose up -d` on your Raspberry Pi, Proxmox VM, CasaOS, Unraid, or Mini PC. Access the dashboard via your local IP (`http://192.168.x.x:3000`) and point your microcontrollers to port `1883`.

### 2. VPS with Custom Domain & Auto-SSL
If deploying on a VPS (Hetzner, DigitalOcean, Linode, AWS Lightsail, etc.) with a single domain:

```bash
# Set your domain in .env
echo "DOMAIN=iot.yourdomain.com" >> .env

# Launch with built-in Caddy reverse proxy (auto Let's Encrypt HTTPS)
docker compose --profile proxy up -d
```

Your single domain handles everything automatically:
- `https://iot.yourdomain.com` ➔ Web Dashboard
- `https://iot.yourdomain.com/v1/*` ➔ API & Realtime WebSockets
- `wss://iot.yourdomain.com/mqtt` ➔ Browser MQTT WebSocket

👉 See **[Deployment Guide (DEPLOYMENT.md)](./DEPLOYMENT.md)** for reverse proxies (Nginx Proxy Manager, Cloudflare Tunnel), backups, and security hardening.

---

## ✨ Features

- **📊 Interactive Dashboards:** Drag-and-drop grid layout optimized for both desktop monitors and mobile devices.
- **🎛️ Rich Widgets:** Value cards, gauges, line/area charts, toggles, push buttons, sliders, color pickers, and live telemetry feeds.
- **⚡ Realtime Telemetry:** Ultra-low-latency dual stream (Native WebSockets with automatic Server-Sent Events fallback).
- **🔄 Visual Automations:** Node-based workflow canvas (React Flow) for triggers, conditions, calculations, and actuators.
- **🔌 Multi-Protocol Ingestion:** Native MQTT (EMQX 5) and HTTP REST endpoints with device hardware tokens.
- **👥 Multi-Tenancy & Access Control:** Projects, role-based access (Owner, Admin, Member, Viewer), and public shareable dashboards.
- **📱 Hardware SDKs:** Out-of-the-box Arduino / ESP32 C++ library.

---

## 📡 Sending Device Telemetry

### 1. MQTT (ESP32, MicroPython, Arduino)
- **Host:** `<your-server-ip>:1883`
- **Topic:** `projects/{project_id}/devices/{device_id}/telemetry`
- **Payload:**
```json
{
  "temperature": 28.5,
  "humidity": 65.2
}
```

### 2. HTTP REST
```bash
curl -X POST http://<your-server-ip>:3001/v1/telemetry \
  -H "Content-Type: application/json" \
  -H "x-device-token: YOUR_HARDWARE_TOKEN" \
  -d '{
    "device_id": "esp32_sensor",
    "project_id": "YOUR_PROJECT_ID",
    "metrics": {
      "temperature": 28.5,
      "humidity": 65.2
    }
  }'
```

### 3. Built-in Hardware Emulator
Simulate an active IoT controller sending real sensor values:
```bash
PROJECT_ID=your_project_id PROJECT_TOKEN=your_token DEVICE_ID=demo_esp32 pnpm emulate
```

---

## 🛠️ Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL and EMQX)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL & EMQX containers
docker compose up -d postgres emqx

# 3. Synchronize database & optionally seed demo data
pnpm db:push
pnpm db:seed

# 4. Start local development servers
pnpm dev
```

---

## 📂 Project Structure

```
raina/
├── apps/
│   ├── server/           # Backend API & automation engine (Hono, Node.js)
│   └── web/              # Frontend web application (React Router v7, Tailwind)
├── packages/
│   ├── db/               # Prisma ORM schema & client
│   ├── workflow/         # Workflow graph execution engine
│   └── shared/           # Shared TypeScript types
├── sdks/
│   └── arduino/          # Arduino / ESP32 client library
├── docker/
│   └── emqx/             # EMQX configuration & hooks
├── Caddyfile             # Optional single-domain auto-HTTPS reverse proxy
└── docker-compose.yml    # Complete self-hosted stack
```

---

## License

MIT License.
