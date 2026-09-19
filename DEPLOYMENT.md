# Deployment Guide

Raina is designed to run effortlessly on any Linux server, VPS (Hetzner, DigitalOcean, Linode, AWS EC2), or Homelab (Raspberry Pi 4/5, Proxmox, CasaOS, Unraid, Mini PC).

The entire platform runs via a single `docker-compose.yml` file.

---

## Requirements

- **OS:** Linux, macOS, or Windows with Docker
- **Hardware:** 2 CPU cores, 2 GB RAM minimum
- **Software:** Docker (Engine 24+) & Docker Compose v2 (`docker compose`)

---

## 🚀 Quick Deployment (2 Minutes)

### Step 1: Clone the repository

```bash
git clone https://github.com/mengsokool/raina.git /opt/raina
cd /opt/raina
```

### Step 2: (Optional) Configure Environment

Raina ships with sensible out-of-the-box defaults so you can test immediately without editing any files. If deploying for production, copy the template and update passwords:

```bash
cp .env.example .env
```

Key environment variables in `.env`:
- `POSTGRES_PASSWORD`: Secret password for PostgreSQL database.
- `EMQX_DASHBOARD_PASSWORD`: Password for EMQX web console (`http://<ip>:18083`).
- `SETUP_TOKEN`: (Optional) Secret token required to register the initial owner account. Leave empty to allow registration on first visit.
- `AUTO_SEED`: (Optional) Set to `true` if you want pre-populated sample farm dashboards and simulated telemetry history.

### Step 3: Start Containers

```bash
docker compose up -d
```

Check status:
```bash
docker compose ps
```

Visit **`http://<your-server-ip>:3000`** in your browser. On your first visit, create the owner account and you are ready to build dashboards!

---

## 🔒 Adding HTTPS with a Custom Domain

You only need **one single domain** (e.g., `iot.yourdomain.com`). Raina does not require multiple subdomains.

### Method A: Built-in Caddy (Automatic Let's Encrypt SSL)

1. Point your domain's DNS `A` record to your VPS public IP.
2. Ensure ports `80`, `443`, and `1883` are open in your server firewall.
3. Add `DOMAIN` to your `.env`:
   ```bash
   echo "DOMAIN=iot.yourdomain.com" >> .env
   ```
4. Start the stack with the `proxy` profile:
   ```bash
   docker compose --profile proxy up -d
   ```

Caddy will automatically provision and renew a free Let's Encrypt TLS certificate for your domain.

### Method B: Existing Reverse Proxy (Nginx Proxy Manager / Traefik / Cloudflare Tunnel)

If you already manage a reverse proxy in your homelab or VPS:

- Forward `HTTP` traffic for your domain to `http://<raina-host>:3000` (or `http://server:3001` for `/v1/*`).
- Enable **WebSocket support** on your proxy so live dashboard telemetry functions with zero latency.
- Direct hardware MQTT devices to port `1883` (TCP).

---

## 🛡️ Firewall & Port Forwarding

If your server has a firewall (UFW, AWS Security Groups, Hetzner Cloud Firewall), allow the following inbound ports:

| Port | Protocol | Purpose | Required For |
| :--- | :--- | :--- | :--- |
| **3000** | TCP | Web Dashboard | Direct HTTP access (without proxy) |
| **3001** | TCP | REST API & WebSockets | Direct HTTP/WS access (without proxy) |
| **1883** | TCP | MQTT Ingestion | ESP32, Arduino, MicroPython hardware |
| **80** | TCP | HTTP / ACME | Only if using Caddy (`--profile proxy`) |
| **443** | TCP | HTTPS | Only if using Caddy (`--profile proxy`) |
| **18083** | TCP | EMQX Admin Console | Optional (monitoring broker connections) |

---

## 💾 Backup & Restore

### Backup Database
Run this single command to create a timestamped, gzip-compressed PostgreSQL dump on the host:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > raina-backup-$(date +%Y%m%d_%H%M%S).sql.gz
```

Save your `.env` file alongside the backup.

### Restore Database
To restore on a fresh installation:

```bash
gunzip < raina-backup-YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

---

## 🔄 Updating Raina

To update to the latest version:

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on container startup without downtime or manual SQL scripts.

---

## 📋 Logs & Troubleshooting

View logs for all services:
```bash
docker compose logs -f
```

View logs for a specific service:
```bash
docker compose logs -f server
docker compose logs -f web
docker compose logs -f emqx
```
