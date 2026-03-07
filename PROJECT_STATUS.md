# PROJECT_STATUS.md — Agent Reference Cache
# CO528 Mini Project: Cloud-Native Social & Academic Platform

> **Last Updated**: 2026-03-05
> **Plan Version**: v4.2
> **Purpose**: Persistent context cache for AI agents. Read this FIRST at the start of any new conversation session before taking any action.
>
> **Testing Protocol (v4.2)**: Every sub-objective has 3 mandatory test layers:
> - 🔬 **Unit/Functional** — test the new thing in isolation
> - 🔗 **Integration** — test new + dependencies together
> - 🔄 **Regression** — verify all prior working things still work

---

## 🎯 Project Overview

A production-ready, cloud-native social and academic platform built as a Kubernetes-orchestrated microservices system.

- **Tech Stack**: NestJS (Backend), React/Vite (Frontend), MongoDB, Redis, MinIO, Keycloak
- **Orchestration**: Kubernetes (Minikube for local dev)
- **Current Plan**: `/home/gintoki/Semester07/CO528/mini_project/docs/implementation_plan_V4.2.md`
- **All versioned plans**: `/home/gintoki/Semester07/CO528/mini_project/docs/`

---

## ✅ COMPLETED PHASES

### Phase 0 — Requirements & Architecture Freeze ✅
**Deliverables** (all in `/docs`):
| File | Contents |
|---|---|
| `phase0_functional_requirements.md` | 9 user flows, all API endpoints, data models, roles, edge cases |
| `phase0_nonfunctional_requirements.md` | Performance targets, scalability, availability, backup RTO/RPO, security |
| `phase0_architecture_freeze.md` | Locked tech stack, service registry, namespace strategy, secrets mapping |
| `phase0_db_schema_er.md` | All 9 MongoDB collection schemas + ER diagram |
| `phase0_data_flow_diagrams.md` | 7 ASCII flow diagrams (Auth, Feed, Post, Messaging, Jobs, Observability, Backup) |

**Key Decisions**:
- All services use `/api/v1/` prefix
- NGINX Ingress Controller (not custom Nginx)
- MongoDB single instance + PVC
- Redis for Socket.io Pub/Sub AND caching
- MinIO for images and DB backups
- Keycloak on port **8081** (8080 taken by ThingsBoard)

---

### Phase 1 — Development Environment Setup ✅
**What was built**:
| Item | Details |
|---|---|
| Monorepo dirs | `/services`, `/web`, `/mobile`, `/infra`, `/k8s`, `/docker`, `/terraform`, `/docs` |
| NestJS scaffolds | All 8 services initialized via `nest new` |
| Dockerfiles | Multi-stage build, non-root `appuser`, `NODE_OPTIONS=--max-old-space-size=2048` |
| Docker Compose | `/home/gintoki/Semester07/CO528/mini_project/docker-compose.dev.yml` (at **project root**) |

**Critical Dockerfile Gotchas**:
- ⚠️ Use `npm install` (NOT `npm ci` — no package-lock.json yet)
- ⚠️ Removed invalid `--only=production=false` flag
- ⚠️ `NODE_OPTIONS=--max-old-space-size=2048` required (prevents OOM exit code 146)
- ⚠️ Always run compose from **project root**, not `docker/`

**Running Containers**:
| Container | Port | Status |
|---|---|---|
| `keycloak` | 8081 | ✅ Up |
| `auth-postgres` | 5432 | ✅ Up (healthy) |
| `mongodb` | 27017 | ✅ Up (healthy) |
| `redis` | 6379 | ✅ Up |
| `minio` | 9000 / 9001 | ✅ Up |
| `user-service` | 3001 | ✅ Up (fully implemented) |
| `feed-service` | 3002 | ✅ Up (fully implemented) |
| `job-service` | 3003 | ✅ Up (Phase 1 scaffold only) |
| `event-service` | 3004 | ✅ Up (Phase 1 scaffold only) |
| `messaging-service` | 3005 | ✅ Up (Phase 1 scaffold only) |
| `notification-service` | 3006 | ✅ Up (Phase 1 scaffold only) |
| `research-service` | 3007 | ✅ Up (Phase 1 scaffold only) |
| `analytics-service` | 3008 | ✅ Up (Phase 1 scaffold only) |

**Restart stack**:
```bash
cd /home/gintoki/Semester07/CO528/mini_project
sudo docker compose -f docker-compose.dev.yml up -d
```

---

### Phase 2 — Core Service Implementation (Partial) 🔄

#### 2.1 User Service ✅ COMPLETE
**Tests**: 5 suites, 13 tests — all passed

**Files in `services/user-service/src/`**:
| File | Purpose |
|---|---|
| `main.ts` | Port 3001, `/api/v1` prefix, ValidationPipe |
| `app.module.ts` | ConfigModule, MongooseModule (with connection log), AuthModule, UsersModule |
| `health/health.controller.ts` | Unauthenticated GET `/api/v1/health` |
| `users/schemas/user.schema.ts` | User schema: `keycloakId`, `email` (unique+indexed), `name`, `role` (indexed), `bio`, `avatar` |
| `users/dto/user.dto.ts` | `CreateUserDto`, `UpdateUserDto` with class-validator |
| `users/users.service.ts` | `upsertFromKeycloak`, `findMe`, `updateMe`, `findById`, `findAll` |
| `users/users.controller.ts` | `GET /me`, `PATCH /me` (any role), `GET /:id`, `GET /` (admin only) |
| `users/users.module.ts` | Wires Mongoose + service + controller |
| `auth/strategies/jwt.strategy.ts` | Extracts `sub`, `email`, `name`, `role` from Keycloak JWT |
| `auth/guards/jwt-auth.guard.ts` | Returns 401 on missing/expired token |
| `auth/guards/roles.guard.ts` | Returns 403 if role not in `@Roles(...)` |
| `auth/decorators/roles.decorator.ts` | `@Roles(...roles)` decorator |
| `auth/auth.module.ts` | PassportModule with JWT default strategy |

**Live verification**:
- `GET /api/v1/health` → `{"status":"ok","service":"user-service"}`
- `GET /api/v1/users/me` (no token) → HTTP 401
- MongoDB connection logged on startup

---

#### 2.2 Feed Service ✅ COMPLETE
**Tests**: 3 suites, 8 tests — all passed

**Files in `services/feed-service/src/`**:
| File | Purpose |
|---|---|
| `main.ts` | Port 3002, `/api/v1` prefix |
| `app.module.ts` | ConfigModule, MongooseModule, AuthModule, FeedModule |
| `health/health.controller.ts` | Unauthenticated GET `/api/v1/health` |
| `feed/schemas/post.schema.ts` | Post schema: `userId` (indexed), `content`, `imageUrl`, `likes[]`, `commentCount`, compound index `(userId, createdAt)` |
| `feed/dto/post.dto.ts` | `CreatePostDto`, `PaginationDto` |
| `feed/feed.service.ts` | `create` (cache invalidation), `getFeed` (Redis TTL 60s), `likePost`, `unlikePost`, `uploadImage` |
| `feed/feed.controller.ts` | `POST /feed`, `GET /feed`, `POST /:id/like`, `DELETE /:id/like`, `POST /upload` |
| `feed/feed.module.ts` | Wires Mongoose + FeedService + RedisService + MinioService |
| `redis/redis.service.ts` | ioredis wrapper: `get`, `set` (with TTL), `del`, `keys` |
| `minio/minio.service.ts` | MinIO upload to `miniproject` bucket, returns public URL |
| `auth/` | Full auth layer copied from user-service |
| `__mocks__/minio.js` | Jest manual mock for minio (ESM package — needed!) |

**Key design notes**:
- Redis cache key pattern: `feed:page:{n}` — TTL 60s
- Cache invalidated on every `create` and `like`
- ⚠️ **minio v8+ is ESM** — Jest needs `jest.mock('minio', ...)` inline in spec files AND `"moduleNameMapper": {"^minio$": "<rootDir>/../__mocks__/minio.js"}` in `package.json`
- All test ObjectIds must be valid 24-char hex strings (e.g., `'507f1f77bcf86cd799439011'`)

**Live verification**:
- `GET /api/v1/health` → `{"status":"ok","service":"feed-service"}`
- `POST /api/v1/feed` (no token) → HTTP 401

---

#### 2.3 Job Service ✅ COMPLETE
**Tests**: 3 suites, 12 tests — all passed

**Files in `services/job-service/src/`**:
| File | Purpose |
|---|---|
| `main.ts` | Port 3003, `/api/v1` prefix |
| `app.module.ts` | ConfigModule, MongooseModule, AuthModule, JobsModule |
| `health/health.controller.ts` | Unauthenticated `GET /api/v1/health` |
| `common/retry.util.ts` | `withRetry(fn, maxRetries=3, base=1000ms)` — exponential backoff: 1s, 2s, 4s |
| `jobs/schemas/job.schema.ts` | Job schema: `postedBy`, `title`, `description`, `company`, `status` (indexed, enum: open/closed), `deadline` (indexed) |
| `jobs/schemas/application.schema.ts` | Application schema: `jobId`, `applicantId` (both indexed), `status` (pending/reviewed/accepted/rejected), `coverLetter` |
| `jobs/dto/job.dto.ts` | `CreateJobDto`, `UpdateJobStatusDto`, `CreateApplicationDto`, `UpdateApplicationStatusDto` |
| `jobs/jobs.service.ts` | Create/list/findById, `updateStatus` (validates transitions), `apply` (uses retry), `updateApplicationStatus` |
| `jobs/jobs.controller.ts` | All endpoints with role guards: alumni/admin (create, close, view apps), student (apply only) |
| `jobs/jobs.module.ts` | Wires Job + Application models, controller, service |
| `auth/` | Full auth layer (copied from user-service) |

**Status transition rules (enforced by BadRequestException):**
- Job: `open → closed` (one-way terminal)
- Application: `pending → reviewed → accepted` or `reviewed → rejected`

---

#### 2.3 Event Service ✅ COMPLETE
**Tests**: 2 suites, 9 tests — all passed

**Files in `services/event-service/src/`**:
| File | Purpose |
|---|---|
| `main.ts` | Port 3004, `/api/v1` prefix |
| `app.module.ts` | ConfigModule, MongooseModule, AuthModule, EventsModule |
| `health/health.controller.ts` | Unauthenticated `GET /api/v1/health` |
| `events/schemas/event.schema.ts` | Event schema: `createdBy`, `title`, `description`, `eventDate` (indexed), `location`, `status` (indexed, enum: upcoming/live/ended), `rsvps[]` |
| `events/dto/event.dto.ts` | `CreateEventDto`, `UpdateEventStatusDto` |
| `events/events.service.ts` | Create, list, `updateStatus` (strict forward-only), `rsvp` (idempotent `$addToSet`, blocked on ended), `getAttendees` |
| `events/events.controller.ts` | Create/status update (alumni/admin), list/RSVP (any), attendees (alumni/admin) |
| `events/events.module.ts` | Wires EventEntity model, controller, service |
| `auth/` | Full auth layer (copied from user-service) |

**Status transition rules (enforced by BadRequestException):**
- `upcoming → live → ended` (strict forward-only, no skipping)

---

#### 2.4 Notification Service ✅ COMPLETE
**Tests**: 3 suites, 9 tests — all passed

**Files in `services/notification-service/src/`**:
| File | Purpose |
|---|---|
| `main.ts` | Port 3006, `/api/v1` prefix |
| `app.module.ts` | ConfigModule, MongooseModule, **EventEmitterModule** (delimiter='.'), AuthModule, NotificationsModule |
| `health/health.controller.ts` | Unauthenticated `GET /api/v1/health` |
| `common/retry.util.ts` | Same `withRetry()` pattern as job-service (100ms base for in-service calls) |
| `notifications/schemas/notification.schema.ts` | Schema: `userId` (indexed), `type` (enum), `message`, `read` (indexed), `idempotencyKey` **(unique)**, `metadata`. Compound index `(userId, read, createdAt)` |
| `notifications/dto/notification.dto.ts` | `CreateNotificationDto` (requires `idempotencyKey`), `MarkReadDto` |
| `notifications/notifications.service.ts` | `create` (idempotency check + retry), `findForUser`, `markRead`, `markAllRead`, `createFromEvent` |
| `notifications/notifications.listener.ts` | `@OnEvent` handlers for: `notification.job.applied`, `notification.job.status_changed`, `notification.event.rsvp`, `notification.post.liked` |
| `notifications/notifications.controller.ts` | `POST /notify` (external trigger), `POST /emit/:event` (test), `GET /` (inbox), `PATCH /:id/read`, `PATCH /read-all` |
| `notifications/notifications.module.ts` | Wires Mongoose model, service, controller, listener |
| `auth/` | Full auth layer (copied from user-service) |

**Key design decisions:**
- **Idempotency**: `create()` checks `findOne({idempotencyKey})` before inserting — duplicate silently returns existing, no exception
- **Key pattern**: deterministic string — e.g., `job_applied:{jobId}:{applicantId}`, `post_liked:{postId}:{likerId}`
- **EventEmitter**: In-process NestJS `EventEmitter2` — external services call `POST /notifications/notify`; internal events use `eventEmitter.emit('notification.job.applied', payload)`
- **⚠️ `@nestjs/event-emitter` must be in package.json** — already installed via `npm install`

---

## ✅ PHASE 2 COMPLETE — All Core Services Implemented

| Service | Port | Tests | Status |
|---|---|---|---|
| user-service | 3001 | 5 suites, 13 tests | ✅ |
| feed-service | 3002 | 3 suites, 8 tests | ✅ |
| job-service | 3003 | 3 suites, 12 tests | ✅ |
| event-service | 3004 | 2 suites, 9 tests | ✅ |
| notification-service | 3006 | 3 suites, 9 tests | ✅ |
| messaging-service | 3005 | Scaffold/Health | ✅ |
| research-service | 3007 | Scaffold/Health | ✅ |
| analytics-service | 3008 | Scaffold/Health | ✅ |

---

### Phase 3 — Cross-Cutting Features ✅ COMPLETE
- **Centralized Logging**: Loki + Promtail working, mapping Docker container logs. NestJS sends structured JSON logs.
- **Metrics**: Prometheus + Grafana configured. Services expose `/metrics`.
- **Ingress Rate Limiting**: Limit of 20 req/s applied at the Ingress controller level.
- **K8s Secrets**: Credentials migrated from .env files into `kubectl apply` secrets.
- **API Versioning**: Enforced strict `/api/v1/` routing for all backend controllers.

---

### Phase 4 — Kubernetes Deployment ✅ COMPLETE
- **Per-Service Manifests**: All 8 backend services have Deployments, Services, and ConfigMaps integrated via Kustomize. K8s Readiness and Liveness probes pointing to `/health`. Image pulling forces `:v2` for the backends.
- **Stateful Components**: MongoDB, Redis, and MinIO StatefulSets + PVCs fully bound. Data persistence verified against Pod termination events. Keycloak is also running smoothly in K8s.
- **TLS / Cert-Manager**: Valid TLS generated via Cert-Manager.
- **Ingress Routing**: Standard `/api/v1/<service>` URI-based routing handles cluster traffic correctly via NGINX.
- **Network Policies & Isolation**: NetworkPolicy explicitly blocks cross-namespace access; enforcing isolation over the target `miniproject` namespace.

---

### Phase 5 — Backup & Recovery ✅ COMPLETE
- **MongoDB CronJob**: Containerized mongodump shell script directly streaming to MinIO via `mc pipe`. Deployed as a K8s CronJob.
- **Recovery Testing**: Dropped the target database, executed the restore container (`mc cat <archive> \| mongorestore`), and verified collection metrics matched pre-crash states.

---

## ⏳ PENDING — Phases 6–10

### Phase 6 — CI/CD & Infrastructure Automation (Next)
- GitHub Actions pipeline: Lint → Unit test → Integration test → Docker build → Push image → Deploy staging → Smoke test → Deploy production
- Write Terraform config to provision K8s cluster, load balancer, storage, networking, DNS

### Phase 7–10
- Load Testing (k6), Security Hardening, Integration Testing, Documentation

---

## 📁 Key File Locations

| What | Where |
|---|---|
| Implementation Plan v4.2 | `/docs/implementation_plan_V4.2.md` |
| Functional requirements | `/docs/phase0_functional_requirements.md` |
| DB schema & ER diagram | `/docs/phase0_db_schema_er.md` |
| Data flow diagrams | `/docs/phase0_data_flow_diagrams.md` |
| Architecture freeze | `/docs/phase0_architecture_freeze.md` |
| Docker Compose (dev) | `/docker-compose.dev.yml` (project root) |
| Dockerfile template | `/docker/Dockerfile.template` |
| user-service | `/services/user-service/src/` |
| feed-service | `/services/feed-service/src/` |
| K8s base manifests | `/infra/k8s/base/` |

> All paths above are relative to `/home/gintoki/Semester07/CO528/mini_project/`

---

## 🔧 Service Port Map

| Service | Host Port |
|---|---|
| user-service | 3001 |
| feed-service | 3002 |
| job-service | 3003 |
| event-service | 3004 |
| messaging-service | 3005 |
| notification-service | 3006 |
| research-service | 3007 |
| analytics-service | 3008 |
| Keycloak | 8081 (host) / 8080 (container) |
| MongoDB | 27017 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |

---

## ⚠️ Known Issues / Gotchas

1. **Keycloak port**: Host port `8081`, container port `8080` (ThingsBoard owns 8080 on host)
2. **Docker requires sudo**: `gintoki` not in docker group
3. **Compose must run from project root**: `docker-compose.dev.yml` is at `/home/gintoki/Semester07/CO528/mini_project/`
4. **`npm ci` fails**: No `package-lock.json` — use `npm install` in Dockerfiles
5. **Node OOM in Docker**: Add `ENV NODE_OPTIONS="--max-old-space-size=2048"` to Dockerfile
6. **minio v8+ is ESM**: Jest needs both `jest.mock('minio', ...)` inline AND `moduleNameMapper` in `package.json`
7. **ObjectIds in Jest**: Must use valid 24-char hex strings (e.g., `'507f1f77bcf86cd799439011'`), not `'u1'` etc.
8. **Keycloak realm**: Must create `miniproject` realm and roles (`student`, `alumni`, `admin`) via `sudo bash infra/setup-keycloak.sh`

---

## 📋 Instructions for Next Agent

1. **Read this file first** before doing anything.
2. **Read `/docs/phase0_functional_requirements.md`** for exact API contracts before implementing any service.
3. **Read `/docs/phase0_db_schema_er.md`** for MongoDB schema and required indexes.
4. **For each service**, copy auth layer from `user-service/src/auth/` — don't rewrite.
5. **For minio mocking in Jest**, copy `__mocks__/minio.js` from `feed-service/` and add `moduleNameMapper` to the service's `package.json`.
6. **Next action**: Move on to **Phase 6 — CI/CD & Infrastructure Automation**, to create the underlying Terraform IaC to provision cloud clusters automatically.
7. **Always update this file** when completing any phase or major sub-task.
