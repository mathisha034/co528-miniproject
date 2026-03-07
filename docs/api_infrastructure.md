# API & Infrastructure Documentation

This guide provides technical reference documentation for the infrastructure policies and API conventions governing the MiniProject Microservices platform.

## 1. REST API Standards
All microservices communicate externally via standard RESTful protocols routed through the NGINX Ingress Controller at `api.miniproject.local`.

- **Base URL**: `http://api.miniproject.local/api/v1/{service-prefix}`
- **Authentication**: Bearer Token (JWT provided by Keycloak). Passed via the `Authorization: Bearer <TOKEN>` header.
- **Content-Type**: `application/json` is strictly required for POST/PUT/PATCH operations.

**Global API Conventions:**
- Success Responses: `200 OK`, `201 Created`
- Client Errors: `400 Bad Request` (Validation), `401 Unauthorized` (Invalid JWT), `403 Forbidden` (Insufficient Roles), `404 Not Found`
- Server Errors: `500 Internal Server Error`, `504 Gateway Timeout`

## 2. Infrastructure Policies

### Logging
Centralized Winston-based logging interceptors are deployed globally across all NestJS bootstrapped microservices (`LoggingInterceptor`).
Logs are output to `stdout`/`stderr` in structured formats, captured systematically by the Kubernetes container engine (`kubectl logs -l app=feed-service`). Request IDs are bound continuously (`UUIDv4`) allowing tracing across the stack.

### Rate Limiting
Endpoint DDoS mitigation is primarily handled by the cluster-wide NGINX Ingress Controller:
- `nginx.ingress.kubernetes.io/limit-rps`: Protects API bottlenecks globally.
- Secondary internal rate limiting is accomplished via NestJS `@nestjs/throttler` plugins, dropping anomalous bursts locally per-pod.

### Database Indexing Strategy
MongoDB utilizes specific B-Tree Document Indexing applied via Mongoose Schema configurations to optimize reading heavily accessed collections:
- `UserSchema`: Indexed heavily on `keycloakId` and `email` for rapid authentication lookups.
- `PostSchema`: Indexed negatively on `{ createdAt: -1 }` for near-instant pagination querying on the main Feed timeline.
- `NotificationSchema`: Compound index on `{ userId: 1, read: 1, createdAt: -1 }` to quickly filter unread user inboxes.

### Backup Strategy
Persistent Volume Claims (PVCs) govern state storage for MongoDB, Redis, and MinIO.
- **MinIO**: Buckets are synced to cold storage backups automatically using standard S3 `mc mirror` lifecycle commands.
- **MongoDB**: `mongodump` cronjobs deployed natively as `CronJob` Kubernetes constructs extract BSON replicasets to centralized backup volumes securely daily, maintaining exact transactional consistency.
