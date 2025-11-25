## Current Backend Baseline

- **Framework**: Single Express + TypeScript service exposing REST routes under `/api/*`.
- **Data Access**: Prisma ORM pointing at a single relational instance (MySQL/Postgres depending on `.env`).
- **Stateful Components**: Direct DB reads/writes inside route handlers; uploads saved to local disk (`/uploads`).
- **Reliability**: No replicas, queues, or cache layers; scaling is vertical only.

This setup is great for rapid iteration, but any failure of the DB node or API process is a full outage, and feed generation is bounded by primary-database query latency.

## Target Distributed Architecture

1. **Service Boundaries**
   - **Auth & Users**: Manages identity, Google OAuth tokens, profile metadata.
   - **Social Graph**: Follows/relations, fan-out triggers.
   - **Content Service**: Posts, media, polls, and moderation workflow.
   - **Engagement Service**: Likes, bookmarks, retweets, notifications aggregation.
   - A lightweight **API gateway** (Express or Spring Cloud Gateway) exposes a unified REST surface; internal services communicate via gRPC/REST with mTLS.

2. **Data Stores**
   - **Distributed SQL**: CockroachDB or YugabyteDB for globally replicated, strongly consistent tables (Prisma supports Cockroach via the Postgres driver).
   - **Object Storage**: S3/GCS for media instead of local `/uploads`.
   - **Cache Layer**: Redis Cluster / KeyDB for timelines, counts, auth sessions.
   - **Search Index**: OpenSearch/Meilisearch fed by change data capture for user/post discovery.

3. **Event Streaming**
   - Kafka/Redpanda topics for `post.created`, `engagement.recorded`, `notification.dispatched`.
   - Consumers fan out posts into per-user feeds, update aggregates, and trigger push/email services.

4. **Observability & Ops**
   - OpenTelemetry tracing from every service → Grafana Tempo/Jaeger.
   - Prometheus scraping + Grafana dashboards; Loki/ELK for logs.
   - GitHub Actions CI/CD with canary + blue/green deploys to Kubernetes (GKE/EKS).

## High-Level Flow

1. **Post Create**
   - API gateway authenticates JWT → forwards payload to Content Service.
   - Content Service writes to distributed SQL (Cockroach) using Prisma.
   - An outbox entry is persisted transactionally; Debezium or Prisma event emitter publishes to Kafka.
   - Social Graph + Engagement consumers enrich the fan-out cache (Redis) and store notification rows.

2. **Feed Read**
   - Feed requests hit API gateway → Feed Service.
   - Feed Service fetches precomputed timelines from Redis; cache misses fall back to Cockroach queries composed via Prisma.
   - Additional enrichment (user cards, counts) retrieved through batched loaders hitting appropriate services.

3. **Notification Delivery**
   - Engagement Service writes durable notification entries and publishes to Kafka.
   - Notification worker updates Redis sorted sets per user and triggers WebSocket/push channels.

## Implementation Phases

1. **Scaffolding**
   - Introduce shared config, logging, and health probes.
   - Add Kafka + Redis clients (without enabling fan-out yet).
   - Switch uploads to pluggable storage (local/S3) with abstraction.
   - Wire Cockroach migrations via `pnpm prisma:migrate:cockroach` so schemas stay in sync.
   - Emit Kafka CDC events (`posts.created`, `posts.deleted`) for downstream replication.

2. **Data Layer Evolution**
   - Update Prisma schema for Cockroach compatibility (UUIDs, explicit primary keys, TIMESTAMPTZ).
   - Provision Cockroach cluster (Docker or managed) and configure migrations + dual-write.
   - Begin replicating to search index + object storage.

3. **Service Extraction**
   - Split modules into separate services (start with Notifications + Feed) while keeping shared proto/contracts.
   - Move read-heavy operations to caches + search.

4. **Operational Hardening**
   - Add automated backups, PITR, circuit breakers, chaos experiments, and blue/green deployments.

This document is the guard-rail for the subsequent refactors: every code change should align to these boundaries and the phased rollout.
