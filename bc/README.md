# Bits Social API (Distributed-Ready Scaffold)

## Local Stack

```bash
cd backend
pnpm install # or npm install
docker compose up -d
pnpm prisma:migrate
# apply schema to Cockroach as well
pnpm prisma:migrate:cockroach
pnpm dev
```

### Services inside `docker-compose.yml`

| Service | Purpose | Local Port |
| --- | --- | --- |
| `postgres` | Legacy transactional DB for backward compatibility | `5432` |
| `cockroach-node1..3` | 3-node distributed SQL cluster (insecure, dev only) | SQL: `26257`, UI: `8081-8083` |
| `redis` | Cache / timeline / rate limits | `6379` |
| `redpanda` | Kafka-compatible broker for event streaming | `9092` (internal), `29092` (host) |
| `minio` | S3-compatible object storage | API `9000`, console `9090` |

> All credentials + URLs are configurable via `.env`. See `docs/distributed-roadmap.md` for the high-level plan.

## Environment Variables

| Key | Description |
| --- | --- |
| `DATABASE_URL` | Legacy Postgres DSN |
| `READ_REPLICA_URL` | Optional read replica DSN |
| `COCKROACH_URL` | Cockroach cluster DSN (when set, the API reads/writes from Cockroach instead of Postgres) |
| `REDIS_URL` | Redis connection string |
| `KAFKA_BROKERS` | Comma separated list of Kafka/Redpanda brokers |
| `OBJECT_STORAGE_*` | Endpoint + credentials for MinIO/S3 |
| `TELEMETRY_ENDPOINT` | Optional OTLP collector target |

### Running with Cockroach (distributed)

1. Start the local Cockroach cluster via `docker compose up -d`.
2. Run `pnpm prisma:migrate:cockroach` so the schema exists in Cockroach.
3. Set `COCKROACH_URL` in `backend/.env` (example already provided).
4. Restart `pnpm dev`. The Prisma client now targets Cockroach for all reads/writes, while the Postgres DSN remains as a fallback/legacy store.

If `COCKROACH_URL` is unset, the API continues using Postgres so you can switch between the two without code changes.
