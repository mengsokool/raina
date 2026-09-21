# Native / low-resource deployment

This deployment mode runs Raina's Node.js API and web dashboard directly under `systemd`. It deliberately keeps PostgreSQL and Redis independent, so they can run locally as native services or remotely as managed services.

It is intended for Debian/Ubuntu-style Linux hosts. Docker Compose remains the simplest all-in-one deployment. Native mode reduces container-runtime overhead, but it does not remove the memory used by PostgreSQL or Redis when those services run on the same machine.

## Topologies

| Topology | Runs on the small host | Use when |
| --- | --- | --- |
| All native | API, web, PostgreSQL, Redis, Caddy | A single host has enough RAM and runs local services. |
| Split / recommended for low-resource hosts | API, web, Caddy | PostgreSQL and Redis are managed or run on another host. |

The API requires PostgreSQL (with TimescaleDB) and Redis (for multi-instance Pub/Sub and device command routing). IoT hardware connects directly to the RLP gateway via TCP (9000) or TLS (8883).

## Prerequisites

- Linux host, Node.js 22+, pnpm 9+, and `systemd`
- PostgreSQL 17 (with TimescaleDB extension) and Redis 7, either reachable locally or as managed services
- Caddy (recommended) or another reverse proxy that supports WebSocket upgrades
- A dedicated non-login `raina` user is created by the install script

For an all-native host, install PostgreSQL and Redis using their official packages for your distribution, bind their administrative ports to loopback, and start both services before starting Raina.

## 1. Configure services

1. Create a PostgreSQL database and role named `raina` (or use your own names) and grant that role access to the database.
2. Ensure Redis is running and reachable on `127.0.0.1:6379` (or your configured managed endpoint).
3. Copy `deploy/native/raina.env.example` to `deploy/native/raina.env`; replace every `CHANGE_ME` value with unique random secrets. Use a precise `CORS_ORIGIN`, never `*` in production.

For a remote database or Redis, change `DATABASE_URL` and `REDIS_URL` in `deploy/native/raina.env`.

## 2. Build and register services

Clone the repository at `/opt/raina`, then run:

```bash
cd /opt/raina
cp deploy/native/raina.env.example deploy/native/raina.env
# edit deploy/native/raina.env
./deploy/native/install.sh
sudo systemctl enable --now raina-server raina-web
```

The installer builds the workspace, installs the protected environment file at `/etc/raina/raina.env`, and registers both systemd units. `raina-server` applies the Prisma schema and TimescaleDB setup before starting when `AUTO_MIGRATE=true`.

## 3. Serve one HTTPS hostname

Copy `Caddyfile` to `/etc/caddy/Caddyfile`, replace `iot.example.com` with your public domain, and reload Caddy. The hostname must resolve to the server and ports 80/443 must be reachable for certificate issuance.

The proxy routes `/v1/*` (including WSS dashboard connections) and `/healthz` to the API (`server:3001`), and all remaining requests to the web app (`web:3000`). Direct IoT hardware to port 9000 (TCP) or 8883 (TLS). Keep ports 3000, 3001, 5432, and 6379 private.

Set `PUBLIC_API_URL`, `PUBLIC_RLP_HOST`, and `CORS_ORIGIN` to that same hostname. When building on a host separate from the public hostname, set `VITE_WS_URL=wss://iot.example.com` in `deploy/native/raina.env` before running the installer.

## Verify, update, and troubleshoot

```bash
curl -fsS http://127.0.0.1:3001/healthz
sudo systemctl status raina-server raina-web
journalctl -u raina-server -u raina-web -f
```

To update: pull the intended revision, rerun `./deploy/native/install.sh`, then restart both units. Back up PostgreSQL before upgrades that change the schema.
