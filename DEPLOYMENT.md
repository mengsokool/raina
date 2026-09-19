# Deploy Raina on a VPS

This path runs the web app, API, PostgreSQL, EMQX and Caddy on one Linux server. You need Docker Compose, `openssl`, three DNS names pointing at the server, and inbound ports 80, 443 and 1883. Allow SSH as well. Use a current Docker installation and at least 2 GB RAM.

For a GCP VM created and bootstrapped automatically, use `scripts/raina-deploy` as described in [terraform/README.md](./terraform/README.md). The rest of this guide applies when you manage the Linux host yourself.

## First install

```bash
git clone https://github.com/mengsokool/raina.git /opt/raina
cd /opt/raina
sh scripts/setup-production.sh app.example.com api.example.com mqtt.example.com
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Replace the example domains with your own DNS names. The setup script creates `.env.production` with random database, broker dashboard, and internal broker credentials; it refuses to overwrite an existing file. Keep this file private and backed up. If changing the database password later, coordinate it with the existing PostgreSQL user; changing the environment variable alone does not rotate a persisted database password.

Open `https://app.example.com`. On the first visit, create the owner account with the `SETUP_TOKEN` from your private `.env.production` file and choose a password of at least eight characters. Raina does not seed a default owner in this mode. The API health endpoint is `https://api.example.com/healthz`.

Caddy terminates HTTPS for the web app, API, and browser MQTT WebSocket at `wss://mqtt.example.com/mqtt`. Hardware MQTT currently uses port 1883 without TLS; place that traffic on a trusted network or an external TLS tunnel before using it over an untrusted network. EMQX's dashboard is internal to Docker in this configuration.

## Configuration and troubleshooting

The generated `.env.production` defines all public addresses. After changing an address, restart with `up -d --build`. Compose rejects missing required values. To inspect startup errors:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 server web emqx
```

The API waits for PostgreSQL schema synchronization. If that fails, it exits and prints the Prisma error instead of starting with an unusable database. Schema synchronization does not accept data loss automatically. Review and back up your data before changing the schema or upgrading Raina.

## Back up and restore

Back up PostgreSQL and `.env.production` before an update. The following database command writes the archive on the host:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > raina-$(date +%Y%m%d).sql.gz
```

To restore, stop `server` and `web`, then import into a fresh database with matching schema and credentials. Test this procedure on a separate installation before relying on it for recovery. EMQX data lives in the `emqx_data` Docker volume and needs its own volume backup if broker state must be preserved.

## Update

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

The repository does not yet have versioned database migrations or a tested rollback workflow. Take a database backup first and review schema changes before updating a production instance.
