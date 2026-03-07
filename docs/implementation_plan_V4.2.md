# Implementation Plan v4.2 — Final Cloud-Ready Architecture + Embedded Testing

> **Version**: v4.2 | **Last Updated**: 2026-03-05
> **Key Change**: Granular tests embedded at every sub-objective level (unit → integration → regression).

---

## 📋 Implementation Guidance

> [!IMPORTANT]
> **Before implementing any phase**, consult previous plan versions in `/docs/implementation_plan_V*.md`.
> **This v4.2 document takes precedence** in all conflicts.

---

## 🧪 Testing Protocol (Applied to Every Sub-Objective)

Each sub-task follows this 3-layer test sequence:

| Layer | When to Run | What It Checks |
|---|---|---|
| **Unit / Functional** | After implementing the sub-task in isolation | The new thing works by itself |
| **Integration** | After connecting the sub-task to its dependencies | The new thing works with shared infra |
| **Regression** | After every integration | Previously working things still work |

---

## 📆 Phase-by-Phase Plan with Embedded Tests

---

### ✅ Phase 0 — Requirements & Architecture Freeze *(COMPLETED)*

All deliverables produced in `/docs/`. No further action needed.

---

### ✅ Phase 1 — Development Environment Setup *(COMPLETED)*

All 8 NestJS services scaffolded and running in Docker Compose.

**Known fixes applied**:
- `npm install` (not `npm ci`) in Dockerfiles
- `NODE_OPTIONS=--max-old-space-size=2048` to prevent OOM
- `docker-compose.dev.yml` must run from project root

---

### Phase 2 — Core Service Implementation (Independent)

#### 2.1 User Service

**2.1.a Bootstrap & Health**
- Implement `GET /api/v1/health` returning `{ status: 'ok', service: 'user-service' }`
- 🔬 **Unit test**: `curl http://localhost:3001/api/v1/health` → `200 { status: 'ok' }`
- 🔗 **Integration test**: Service boots with `MONGO_URI` env set → no crash
- 🔄 **Regression**: Other services health still return 200

**2.1.b MongoDB Connection & User Schema**
- Define Mongoose `User` schema (email unique, role indexed)
- 🔬 **Unit test**: `jest` — UserSchema validates required fields, rejects duplicate email
- 🔗 **Integration test**: Service connects to MongoDB on start, logs "MongoDB connected"
- 🔄 **Regression**: Health endpoint still returns 200 after DB connected

**2.1.c JWT Validation Middleware**
- Validate `Authorization: Bearer <token>` using Keycloak public key
- 🔬 **Unit test**: `jest` — middleware rejects missing/expired token with 401
- 🔗 **Integration test**: Send real JWT from Keycloak → middleware passes request to controller
- 🔄 **Regression**: Health endpoint (unauthenticated) still returns 200

**2.1.d Profile CRUD Endpoints**
- `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `GET /api/v1/users/:id`
- 🔬 **Unit test**: `jest` — controller calls service methods with correct args
- 🔗 **Integration test**: `curl` with JWT → CRUD ops reflect in MongoDB
- 🔄 **Regression**: Health and JWT middleware still work

**2.1.e Role Guard**
- Admin-only on `GET /api/v1/users/` (list all)
- 🔬 **Unit test**: Role guard rejects non-admin JWT with 403
- 🔗 **Integration test**: Student JWT → 403; Admin JWT → 200
- 🔄 **Regression**: Student can still reach `GET /me`

**2.1.f MongoDB Indexes**
- Create indexes: `email` (unique), `role`
- 🔬 **Unit test**: Insert duplicate email → expect `MongoServerError E11000`
- 🔗 **Integration test**: `explain()` on a role query → confirms `IXSCAN`
- 🔄 **Regression**: All CRUD endpoints still work after index creation

---

#### 2.2 Feed Service

**2.2.a Bootstrap & Health**
- `GET /api/v1/health` returning service status
- 🔬 **Unit test**: `curl http://localhost:3002/api/v1/health` → 200
- 🔄 **Regression**: user-service health still 200

**2.2.b Post Schema & CRUD**
- Create + paginate posts
- 🔬 **Unit test**: jest — PostSchema validates required fields
- 🔗 **Integration test**: POST/GET with JWT → data persists in MongoDB

**2.2.c MinIO Image Upload**
- Upload to MinIO, return presigned URL
- 🔬 **Unit test**: MinIO client mock → upload function called with correct bucket/key
- 🔗 **Integration test**: Real upload to MinIO → file appears in `miniproject` bucket
- 🔄 **Regression**: Post CRUD still works without image

**2.2.d Redis Cache (TTL)**
- Cache `GET /api/v1/feed?page=1` for 60s with key `feed:page:1`
- 🔬 **Unit test**: Cache miss → DB queried; cache hit → DB not queried (mock)
- 🔗 **Integration test**: `redis-cli GET feed:page:1` has data after first request
- 🔄 **Regression**: Post creation invalidates cache; new post appears on next fetch

**2.2.e MongoDB Indexes**
- `userId`, `createdAt`, compound `(userId, createdAt)`
- 🔬 **Unit test**: Insert without userId → validation error
- 🔗 **Integration test**: `explain()` on feed query → confirms `IXSCAN`

---

#### 2.3 Job/Event Service

**2.3.a Bootstrap, Schema, CRUD** (apply 2-layer test: unit + integration)

**2.3.b Status Transitions**
- `pending → active → closed` for jobs, `upcoming → live → ended` for events
- 🔬 **Unit test**: Invalid transition rejected (e.g. `closed → active`)
- 🔗 **Integration test**: Patch status → verify in MongoDB

**2.3.c Retry with Exponential Backoff**
- Retry failed internal notifications up to 3x with backoff: 1s, 2s, 4s
- 🔬 **Unit test**: Mock failure → verify retry called 3 times with correct delays
- 🔄 **Regression**: Successful calls do not retry

**2.3.d MongoDB Indexes** (`status`, `deadline`)
- 🔬 **Unit test**: `explain()` on status filter → `IXSCAN`

---

#### 2.4 Notification Service

**2.4.a Async Event Listener**
- Listen for HTTP POST from other services (or internal call)
- 🔬 **Unit test**: Send test event → notification saved to MongoDB
- 🔗 **Integration test**: job-service triggers notification → appears in user's feed

**2.4.b Retry + Idempotency**
- Idempotency key prevents duplicate notifications
- 🔬 **Unit test**: Same idempotency key sent twice → only one notification stored
- 🔄 **Regression**: Normal notifications still created on first attempt

---

### Phase 3 — Cross-Cutting Features

#### 3.1 Centralized Logging (Loki + Promtail)
- Deploy Loki + Promtail via `docker-compose.dev.yml`
- 🔬 **Unit test**: Restart any service → its startup log appears in Grafana Loki UI
- 🔗 **Integration test**: Make an API call → log entry with `requestId` visible in Loki
- 🔄 **Regression**: Service API still responds correctly while shipping logs

#### 3.2 Prometheus + Grafana
- Deploy and add `/metrics` to each service
- 🔬 **Unit test**: `curl http://localhost:3001/metrics` → Prometheus text format response
- 🔗 **Integration test**: Prometheus scrape target shows services as `UP`
- 🔄 **Regression**: `/api/v1/health` still works alongside `/metrics`

#### 3.3 Rate Limiting (Ingress)
- Configure NGINX Ingress or local NGINX with `limit_req_zone`
- 🔬 **Unit test**: Fire 20 requests/sec to any endpoint → 429 responses appear
- 🔄 **Regression**: Normal requests (< limit) still get 200

#### 3.4 Kubernetes Secrets
- Convert all credentials to K8s `Secret` objects
- 🔬 **Unit test**: Remove env var from Compose/K8s → service fails to start (expected)
- 🔗 **Integration test**: Deploy with Secret mounted → service connects to DB normally
- 🔄 **Regression**: All authenticated endpoints still respond correctly

#### 3.5 API Versioning
- All routes strictly under `/api/v1/`
- 🔬 **Unit test**: `curl /api/v2/users` → 404
- 🔬 **Unit test**: `curl /users` (no prefix) → 404
- 🔄 **Regression**: All `/api/v1/` routes still return expected responses

---

### Phase 4 — Kubernetes Deployment

#### 4.1 Per-Service K8s Manifests
*Per service: Deployment, Service, ConfigMap, Secret, HPA, probes, resource limits*

- 🔬 **Unit test (per service)**: `kubectl apply --dry-run=client -f <manifest>` → no errors
- 🔗 **Integration test**: `kubectl apply` → pod reaches `Running` state, readiness probe passes
- 🔄 **Regression**: After deploying service A, all previously deployed services still `Running`

#### 4.2 Stateful Components (MongoDB, Redis, MinIO)
- 🔬 **Unit test**: `kubectl get pvc` → all PVCs in `Bound` state
- 🔗 **Integration test**: Write data → delete pod → data survives pod restart
- 🔄 **Regression**: All services that depend on MongoDB still connect after restart

#### 4.3 TLS / Cert-Manager
- 🔬 **Unit test**: `kubectl get certificate` → `Ready=True`
- 🔗 **Integration test**: `curl https://<domain>` → valid TLS handshake, no cert error
- 🔄 **Regression**: HTTP→HTTPS redirect works; existing API responses unchanged

#### 4.4 NGINX Ingress Routing
- 🔬 **Unit test**: `curl /api/v1/users` through Ingress → reaches user-service (check response header)
- 🔗 **Integration test**: All 8 service routes work through the Ingress IP
- 🔄 **Regression**: Direct service access (ClusterIP) still works internally

#### 4.5 Namespaces + Network Policies
- 🔬 **Unit test**: Pod in `monitoring` cannot reach pod in `production` via direct IP
- 🔄 **Regression**: Ingress still routes to all services

---

### Phase 5 — Backup & Recovery

#### 5.1 MongoDB Backup CronJob
- 🔬 **Unit test**: Trigger CronJob manually → verify dump tarball appears in MinIO `backups/`
- 🔗 **Integration test**: Open MinIO console → file exists and is non-zero size
- 🔄 **Regression**: MongoDB still accessible during backup run

#### 5.2 Recovery Test
- 🔬 **Unit test**: Drop the `miniproject_db` database → restore from MinIO backup → verify collections exist
- 🔗 **Integration test**: After restore, `GET /api/v1/feed` returns previously created posts
- 🔄 **Regression**: All services reconnect to MongoDB automatically after restore

---

### Phase 6 — CI/CD & Infrastructure Automation

#### 6.1 GitHub Actions Pipeline
- 🔬 **Unit test (per stage)**: Each stage (lint, test, build, push) passes independently
- 🔗 **Integration test**: Push to `main` → pipeline runs end-to-end → image pushed to Docker Hub
- 🔄 **Regression**: Existing passing tests don't break on any PR

#### 6.2 Terraform
- 🔬 **Unit test**: `terraform plan` → no errors, shows expected resources
- 🔗 **Integration test**: `terraform apply` → cluster and infra provisioned successfully
- 🔄 **Regression**: `terraform plan` after apply → shows zero drift

---

### Phase 7 — Performance & Scalability

#### 7.1 Load Testing
- 🔬 **Baseline test**: k6 with 10 users → all requests succeed, p95 < 500ms
- 🔗 **Scale test**: k6 ramp 100→500 users → observe HPA triggering, no crash loops
- 🔄 **Regression**: After load subsides, HPA scales back to min replicas; latency returns to baseline

---

### Phase 8 — Security Hardening

#### 8.1 Non-Root + Capabilities
- 🔬 **Unit test**: `kubectl exec` into pod → `whoami` returns `appuser`, not `root`
- 🔄 **Regression**: Service still handles requests normally after securityContext applied

#### 8.2 Network Policies
- 🔬 **Unit test**: Test pod in wrong namespace cannot reach production service
- 🔄 **Regression**: Legitimate cross-service calls still work

#### 8.3 Image Scanning (Trivy)
- 🔬 **Unit test**: `trivy image <image>` → no CRITICAL vulnerabilities
- 🔄 **Regression**: Image still builds and runs after any dependency changes

---

### Phase 9 — Final Integration & Stability

#### 9.1 Staged Integration (Sequential)
*Auth → User → Feed → Cache → Event → Notification → Ingress*

- After each service is integrated: run its full chain test end-to-end
- 🔬 **Chain test**: Complete user journey (login → post → like → notification)
- 🔄 **Regression after each integration**: All previously integrated services still pass their chain tests

#### 9.2 Failure Simulation
- 🔬 **Kill pod test**: `kubectl delete pod <mongo-pod>` → pod restarts, service reconnects
- 🔬 **Network delay test**: Add `tc` delay → service returns within acceptable timeout
- 🔄 **Regression**: After chaos, all services recover within 60s

---

### Phase 10 — Documentation

No functional tests. Peer-reviewed for completeness and accuracy.

---

## ✅ Final Architecture Capabilities

| Capability | Status |
|---|---|
| Kubernetes Orchestration | ✔ |
| Horizontal Scaling (HPA) | ✔ |
| TLS Everywhere | ✔ |
| JWT + RBAC | ✔ |
| Secrets Management | ✔ |
| API Versioning | ✔ |
| Centralized Logging | ✔ |
| Metrics & Monitoring | ✔ |
| Backup & Recovery | ✔ |
| DB Indexing | ✔ |
| Caching (Redis TTL) | ✔ |
| Retry Logic | ✔ |
| CI/CD Pipeline | ✔ |
| IaC (Terraform) | ✔ |
| Testing at Every Layer | ✔ |
| Security Hardening | ✔ |
| Fault Tolerance | ✔ |
