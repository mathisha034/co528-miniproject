# API & Infrastructure Documentation

This document records the current external API contract behind ingress, including corrected endpoint paths and known missing implementations.

## 1. External API Routing Standard

All external requests go through ingress host:

- Host: http://miniproject.local
- External pattern: /api/v1/{service-name}-service/{controller-path}
- Example: /api/v1/user-service/users/me

Authentication:

- Authorization header is required for protected routes: Bearer <JWT>

HTTP conventions:

- Success: 200, 201
- Client errors: 400, 401, 403, 404
- Server errors: 500, 504

## 2. Wrong URL -> Correct URL

The following were identified as wrong/outdated URL forms.

| Wrong URL | Correct URL |
|---|---|
| http://api.miniproject.local/api/v1/{service-prefix} | http://miniproject.local/api/v1/{service-name}-service/{controller-path} |
| /api/v1/users/me | /api/v1/user-service/users/me |
| /api/v1/feed | /api/v1/feed-service/feed |
| /api/v1/jobs | /api/v1/job-service/jobs |
| /api/v1/events | /api/v1/event-service/events |
| /api/v1/notifications | /api/v1/notification-service/notifications |
| /api/v1/research | /api/v1/research-service/research |
| /api/v1/analytics/summary | /api/v1/analytics-service/analytics/overview |
| /api/v1/analytics/posts | /api/v1/analytics-service/analytics/posts |
| /api/v1/analytics/jobs | /api/v1/analytics-service/analytics/jobs |
| /api/v1/analytics/users | /api/v1/analytics-service/analytics/users |
| /api/v1/analytics/latencies | /api/v1/analytics-service/analytics/latencies |
| /api/v1/messages/:conversationId | MISSING: no messages REST controller is currently implemented |

## 3. Missing Implementations

Items documented in plans/older docs but not implemented in the current backend codebase.

### TODO: Feed comments endpoints are missing

- MISSING: POST /api/v1/feed-service/feed/:id/comments
- MISSING: GET /api/v1/feed-service/feed/:id/comments
- Status: No controller methods exist for comments in feed controller.

### TODO: Messaging REST conversation endpoint is missing

- MISSING: GET /api/v1/messaging-service/messages/:conversationId
- Status: Messaging service currently exposes health endpoint only.

### TODO: Messaging WebSocket endpoint is not implemented/documented in backend service

- MISSING: WS /api/v1/messaging-service/ws
- Status: No websocket gateway/controller currently present in messaging service.

## 4. Infrastructure Policies

### Logging

- Most services register a global Nest `LoggingInterceptor` in `main.ts` to log request/response timing and status.
- `user-service` additionally wires a global `AllExceptionsFilter` to normalize and log unhandled errors.
- Operational log collection is currently via Kubernetes stdout/stderr (`kubectl logs`) and can be shipped by the cluster logging stack.

### Rate Limiting

- Service-level throttling is actively enforced with `@nestjs/throttler`.
- Services configure `ThrottlerModule.forRoot([{ ttl: 10000, limit: 100 }])` and bind `ThrottlerGuard` as `APP_GUARD`, which applies the default limit globally.
- Kubernetes service configmaps expose the same values via `RATE_LIMIT_TTL=10000` and `RATE_LIMIT_MAX=100` for environment-level consistency.
- Ingress currently performs path routing and rewrite only; no ingress rate-limit annotations are configured in the active ingress manifest.

### Data Layer

- MongoDB is the primary datastore across domain services using Mongoose schemas.
- Index strategy is implemented in schema files, not only in documentation. Examples include:
	- `feed-service`: feed timeline indexes on `(userId, createdAt)` and `(createdAt)`.
	- `job-service`: unique application index on `(jobId, applicantId)` to prevent duplicate applications.
	- `notification-service`: compound index on `(userId, read, createdAt)` for inbox queries.
	- `research-service`: indexes on `ownerId`, `status`, and `collaborators`.
- Redis is actively used for feed caching with key-based invalidation (`feed:page:*`) and TTL-based entries (60 seconds).
- MinIO is used for object storage and backup archives.

### Metrics

- `analytics-service` and `user-service` expose a `metrics` controller and collect Prometheus default metrics using `prom-client`.
- Metric names are prefixed per service (for example `analytics_service_` and `user_service_`) to avoid collisions in shared scraping pipelines.

### Backup

- Backup execution is implemented as a Kubernetes `CronJob` named `mongodb-backup` in namespace `miniproject`.
- Schedule is daily at midnight (`0 0 * * *`) and runs the backup container image `mini_project-backup:v2`.
- The backup script performs streaming archive backups: `mongodump --archive | mc pipe myminio/backups/<timestamp>.archive`.
- Secrets provide runtime credentials (`MONGO_URI`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`), and backups are written to MinIO bucket `backups`.
- Disaster recovery support exists via a restore job manifest and restore script (`mongorestore` from selected archive).
