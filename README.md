# Raina

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](#quickstart)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql&logoColor=white)](#tech-stack)
[![MQTT](https://img.shields.io/badge/MQTT-EMQX%205-009A61?logo=eclipse-mosquitto&logoColor=white)](#tech-stack)

A self-hosted IoT platform for managing dashboards, device telemetry, and automated workflows.

> Developed upon the architecture of [Nodrix](https://github.com/nodrix).

---

## Features

- **Dashboards:** Customizable grid layout with support for desktop and mobile views.
- **Widgets:** Value displays, charts, switches, sliders, buttons, and gauges.
- **Automations:** Node-based workflow canvas for triggers, conditions, and actions.
- **Data Ingestion:** Supports MQTT (EMQX) and HTTP REST endpoints.
- **Access Control:** Multi-project organization, user roles, and device tokens.

---

## Tech Stack

- **Backend:** Node.js (Hono), Prisma ORM
- **Database:** PostgreSQL 17
- **Broker:** EMQX 5 (MQTT / WebSocket)
- **Frontend:** React, Tailwind CSS, shadcn/ui, React Flow
- **Tooling:** Turborepo, pnpm

---

## Quickstart

Run the full stack with Docker Compose:

```bash
# 1. Clone repository
git clone https://github.com/mengsokool/raina.git
cd raina

# 2. Configure environment
cp .env.example .env

# 3. Start containers
docker compose up -d
```

### Local endpoints
- **Web App:** [http://localhost:3000](http://localhost:3000)
  - On first visit, create the owner account with your own password.
- **API Server:** [http://localhost:3001](http://localhost:3001)
- **EMQX Dashboard:** [http://localhost:18083](http://localhost:18083) (`admin` / `rainasecret`)
- **MQTT Broker:** `localhost:1883` (TCP) / `localhost:8083` (WS)

After creating the owner account, create a project and a hardware token on its Devices page. To simulate an ESP32 using that token:

```bash
PROJECT_ID=your_project_id PROJECT_TOKEN=your_hardware_token DEVICE_ID=demo_esp32 pnpm emulate
```

The emulator connects to the local broker and publishes changing sensor values. Set `EMQX_BROKER_URL` to target a different broker.

---

## Deployment

The supported production path is Docker Compose on a Linux host that you control. It runs the web app, API, PostgreSQL, EMQX, and Caddy together with generated credentials.

👉 **[Deployment Guide (DEPLOYMENT.md)](./DEPLOYMENT.md)**

For GCP, use [scripts/raina-deploy](./scripts/raina-deploy). It creates the VM, deploys Raina on first boot, and checks DNS plus API health from one `raina.deploy.env` file: [terraform/README.md](./terraform/README.md).

Render, Railway, and Cloud Run configurations are intentionally not included. They cannot provide the full Raina stack, particularly the MQTT broker reachable by devices, as a single supported deployment.

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL and EMQX)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start database and broker
docker compose up -d postgres emqx

# 3. Migrate and seed database
pnpm db:push
pnpm db:seed

# 4. Start development servers
pnpm dev
```

For extension points and development conventions, see [Extending Raina](./docs/EXTENDING.md).

---

## Device Telemetry

### 1. MQTT
- **Host:** `your-server-ip:1883`
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
curl -X POST https://api.your-domain.example/v1/telemetry \
  -H "Content-Type: application/json" \
  -H "x-device-token: YOUR_DEVICE_TOKEN" \
  -d '{
    "device_id": "dev_01",
    "project_id": "proj_01",
    "metrics": {
      "temperature": 28.5,
      "humidity": 65.2
    }
  }'
```

---

## Project Structure

```
raina/
├── apps/
│   ├── server/           # Backend API & automation runner
│   └── web/              # Frontend web application
├── packages/
│   ├── db/               # Prisma schema & database client
│   ├── workflow/         # Workflow graph engine
│   └── shared/           # Shared types
├── sdks/
│   └── arduino/          # Arduino/ESP32 client library
├── docker-compose.yml
└── docker-compose.prod.yml
```

---

## License

MIT License.
