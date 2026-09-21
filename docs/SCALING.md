# Scaling Raina

Raina starts as a single API process and remains fully functional when Redis is disabled. Enable Redis only when running more than one API or worker instance.

## Runtime roles

| Role | Responsibility | Scale independently? |
| --- | --- | --- |
| API | HTTP, WebSocket/SSE, MQTT telemetry ingestion, device commands | Yes |
| Worker | Scheduled automations, retention cleanup, Redis Stream automation jobs | Yes |
| Redis | Cross-instance realtime fan-out, short dashboard-series cache, locks and job streams | One durable instance, or managed Redis |

The API never runs the scheduler when `SCHEDULER_ENABLED=false`. Workers use a Redis lock for scheduled work and a Redis Streams consumer group for telemetry-triggered automation jobs, so multiple workers do not duplicate a claimed job. Jobs that fail three times are retained in `raina:automation:evaluations:dead-letter` for investigation.

API instances consume MQTT through the `raina-api` EMQX shared-subscription group, so a device telemetry message is delivered to one API replica rather than being ingested once per replica.

## Production compose settings

The deployment stack reads these values from its server environment:

```dotenv
REDIS_ENABLED=true
REDIS_URL=redis://:your-password@redis:6379
SERVER_REPLICAS=1
WORKER_REPLICAS=1
```

Increase `SERVER_REPLICAS` to add stateless API instances, or `WORKER_REPLICAS` to increase job throughput. Caddy remains the sole public entry point; the service domain and Cloud Run BFF configuration do not change.

For a managed Redis deployment, set `REDIS_URL` to its TLS-capable endpoint and omit the local Redis service from the infrastructure compose file. The application deliberately falls back to local realtime and in-process automation evaluation if Redis is unavailable, rather than failing API traffic.

## Operational checks

- `GET /v1/admin/diagnostics` shows Redis connection state to staff users.
- `docker compose ps` should show Redis healthy and the requested API/worker replica count.
- Inspect failed automation jobs with `XREAD COUNT 100 STREAMS raina:automation:evaluations:dead-letter 0-0` using an authenticated Redis client.
