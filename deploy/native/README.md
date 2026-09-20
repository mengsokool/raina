# Native / low-resource deployment

This deployment mode runs Raina's Node.js API and web dashboard directly under `systemd`. It deliberately keeps PostgreSQL and EMQX independent, so they can run locally as native services or remotely as managed services.

It is intended for Debian/Ubuntu-style Linux hosts. Docker Compose remains the simplest all-in-one deployment. Native mode reduces container-runtime overhead, but it does not remove the memory used by PostgreSQL or EMQX when those services run on the same machine.

## Topologies

| Topology | Runs on the small host | Use when |
| --- | --- | --- |
| All native | API, web, PostgreSQL, EMQX, Caddy | A single host has enough RAM and needs local MQTT. |
| Split / recommended for low-resource hosts | API, web, Caddy | PostgreSQL and EMQX are managed or run on another host. |

The API requires both PostgreSQL and EMQX. Do not point it at arbitrary public MQTT or database endpoints: EMQX must use the supplied HTTP authentication and ACL webhooks.

## Prerequisites

- Linux host, Node.js 22+, pnpm 9+, and `systemd`
- PostgreSQL 17 and EMQX 5, either reachable locally or as managed services
- Caddy (recommended) or another reverse proxy that supports WebSocket upgrades
- A dedicated non-login `raina` user is created by the install script

For an all-native host, install PostgreSQL and EMQX using their official packages for your distribution, bind their administrative ports to loopback, and start both services before starting Raina.

## 1. Configure services

1. Create a PostgreSQL database and role named `raina` (or use your own names) and grant that role access to the database.
2. Copy `emqx-raina.hocon` into the native EMQX configuration **in addition to** its existing configuration. Replace both `REPLACE_WITH_THE_SAME_EMQX_WEBHOOK_SECRET` values with the `EMQX_WEBHOOK_SECRET` in the environment file. It routes broker authentication and ACL requests to the local API. Restart EMQX after validating the config.
3. Copy `raina.env.example` to `raina.env`; replace every `CHANGE_ME` value with unique random secrets. Use a precise `CORS_ORIGIN`, never `*` in production.

For a remote database or broker, change only `DATABASE_URL`, `EMQX_BROKER_URL`, and `EMQX_API_URL`. Keep `EMQX_AUTH_WEBHOOK_URL` and `EMQX_ACL_WEBHOOK_URL` reachable from the broker; if EMQX is remote, replace `127.0.0.1` with the API's private hostname and protect the route with `EMQX_WEBHOOK_SECRET`.

## 2. Build and register services

Clone the repository at `/opt/raina`, then run:

```bash
cd /opt/raina
cp deploy/native/raina.env.example deploy/native/raina.env
# edit deploy/native/raina.env
./deploy/native/install.sh
sudo systemctl enable --now raina-server raina-web
```

The installer builds the workspace, installs the protected environment file at `/etc/raina/raina.env`, and registers both systemd units. `raina-server` applies the Prisma schema before starting when `AUTO_MIGRATE=true`.

## 3. Serve one HTTPS hostname

Copy `Caddyfile` to `/etc/caddy/Caddyfile`, replace `iot.example.com`, and reload Caddy. The hostname must resolve to the server and ports 80/443 must be reachable for certificate issuance.

The proxy routes `/v1/*` (including WSS dashboard connections) to the API, `/mqtt*` to EMQX WebSocket, and all remaining requests to the web app. Keep ports 3000, 3001, and 18083 private; expose 1883 only when hardware devices use native MQTT.

Set `PUBLIC_API_URL`, `PUBLIC_MQTT_HOST`, `PUBLIC_MQTT_WS_URL`, and `CORS_ORIGIN` to that same hostname. When building on a host separate from the public hostname, set `VITE_WS_URL=wss://iot.example.com` in `raina.env` before running the installer.

## Verify, update, and troubleshoot

```bash
curl -fsS http://127.0.0.1:3001/healthz
sudo systemctl status raina-server raina-web
journalctl -u raina-server -u raina-web -f
```

To update: pull the intended revision, rerun `./deploy/native/install.sh`, then restart both units. Back up PostgreSQL before upgrades that change the schema.
