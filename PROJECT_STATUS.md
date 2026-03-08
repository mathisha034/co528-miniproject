# PROJECT_STATUS.md — Agent Reference Cache
# CO528 Mini Project: Cloud-Native Social & Academic Platform

> **Last Updated**: 2026-03-08
> **Plan Version**: v5.0 — all implementation phases complete; gap-fixing cycle complete; E2E suite at 331/331
> **Purpose**: Persistent context cache for AI agents. Read this FIRST at the start of any new conversation session before taking any action.
>
> **Testing Protocol**: Every sub-objective requires 3 test layers:
> - 🔬 **Unit/Functional** — gap test in isolation (`test_sN_gaps.js`)
> - 🔗 **Integration** — full scenario file (`test_sN.js`)
> - 🔄 **Regression** — full suite (`bash tests/e2e/run_all.sh`) — must stay at 0 failures

---

## 🎯 Project Overview

A production-ready, cloud-native social and academic platform built as a Kubernetes-orchestrated microservices system.

- **Tech Stack**: NestJS (Backend), React/Vite (Frontend), MongoDB, Redis, MinIO, Keycloak
- **Orchestration**: Kubernetes (Minikube for local dev)
- **Implementation Plan**: `docs/implementation_plan_v5.md`
- **E2E Test Results**: `docs/e2e_test_results.md`
- **Bug Tracker**: `docs/known_issues/errors_log.md`

---

## ✅ COMPLETED PHASES

### Phase 0 — Architecture Freeze ✅
9 user flows, API endpoints, data models, NFRs, roles, edge cases documented.
NGINX Ingress, MongoDB (StatefulSet + PVC), Redis, MinIO, Keycloak stack finalised.
Docs: `docs/phase0_*.md`, `docs/architecture.md`

### Phase 1 — Development Environment Setup ✅
Monorepo structure, per-service Dockerfiles (non-root, OOM-safe `--max-old-space-size=2048`), `docker-compose.dev.yml`.

### Phase 2 — Core Microservices ✅
All 7 planned services fully implemented, unit-tested, and cluster-deployed:

| Service | Port | Ingress Prefix | Current Image |
|---------|------|---------------|---------------|
| user-service | 3001 | `/api/v1/user-service/*` | `mini_project-user-service` |
| feed-service | 3002 | `/api/v1/feed-service/*` | `feed-service:v11` |
| job-service | 3003 | `/api/v1/job-service/*` | `job-service:v4` |
| event-service | 3004 | `/api/v1/event-service/*` | `event-service:v3` |
| notification-service | 3006 | `/api/v1/notification-service/*` | `mini_project-notification-service` |
| research-service | 3007 | `/api/v1/research-service/*` | `research-service:v8` |
| analytics-service | 3008 | `/api/v1/analytics-service/*` | `analytics-service:v4` |
| messaging-service | 3005 | `/api/v1/messaging-service/*` | `mini_project-messaging-service:v2` (health/MVP only) |

### Phase 3 — Cross-Cutting Features ✅
- Centralised structured logging (Loki/Grafana, `infra/loki/`, `infra/grafana/`)
- Prometheus metrics (`/metrics`) on all services (`infra/prometheus/`)
- Rate limiting (`ThrottlerGuard`) on all services
- Kubernetes Secrets injected into pods (JWT, MinIO, MongoDB, Redis, Keycloak)
- `x-internal-token` guard on all inter-service notification calls

### Phase 4 — Kubernetes Deployment ✅
Per-service Deployments, StatefulSets (MongoDB/Redis/MinIO), TLS/Cert-Manager,
NGINX Ingress routing (`k8s/ingress.yaml`), Network Policies (`k8s/network-policy.yaml`).
HPA manifests: `k8s/services/hpas.yaml`.

### Phase 5 — Backup & Recovery ✅
MongoDB CronJob to MinIO via `mc pipe`. Restore job confirmed working.
Files: `k8s/infra/backup-cronjob.yaml`, `k8s/infra/restore-job.yaml`, `infra/backup/`.

### Phase 6 — CI/CD & Infrastructure Automation ✅
GitHub Actions pipeline (Lint → Test → Build → Push). Terraform IaC for EKS: `terraform/main.tf`.

### Phase 7 — Performance & Scalability ✅
k6 load tested to 500 concurrent users. HPA triggers active.
Scripts: `load-tests/baseline.js`, `load-tests/stress.js`, `load-tests/internal_stress.js`.

### Phase 8 — Security Hardening ✅
Non-root containers (`addgroup/adduser` in Dockerfiles), Network Policies, dropped Linux capabilities,
Image scanning (Trivy in CI), `x-internal-token` inter-service auth.

### Phase 9 — Web Application (React SPA) ✅
Full React/Vite SPA in `web/src/`, integrated with K8s backend:
- **Pages**: Dashboard, Feed, Jobs, Events, Research, Notifications, Profile, Analytics (Admin), InfraStatus
- **Auth**: Keycloak JS adapter + Axios interceptors for JWT + refresh
- **UI**: Custom component library — Cards, Badges, Buttons, Modals, fully responsive CSS
- 48-assertion cross-service cluster E2E test passed

### Phase 9.5 — Manual Bug Fixing (The Great Debug) ✅
60+ critical/medium bugs resolved, including:
- Ingress routing mismatches (`feed-service` ConfigMap missing `MINIO_ENDPOINT`)
- Mongoose CastError/BSONError from Keycloak UUIDs wrapped in `Types.ObjectId()`
- Silent failures in Redis cache, MinIO upload, and notification dispatch chains
- Test infrastructure teardown races and data pollution between test runs
- Kubernetes image tag drift (stale Docker layer cache bypassed with `--no-cache`)

### Phase 10 — Final Integration & Stability ✅
Full stack verified with fault injection (scenario `S10`):
- MongoDB pod kill → StatefulSet auto-recovery, services reconnect < 60 s
- feed-service pod kill → Deployment controller recreates, Nginx endpoint syncs < 40 s
- Redis scaled to 0 → `RedisService.available=false` fallback, MongoDB serves all reads
- MinIO scaled to 0 → upload returns 503, text-only posts and all reads unaffected
- 100 ms network delay → all services still respond 200

### Phase 10.5 — E2E Gap-Fix Cycle ✅  ← **NEW since last status update**
After the full S1–S10 E2E suite was established, all originally-detected assertion gaps were
implemented as real service features. **No `assertGap` calls remain in any integration test.**

| Service | Gaps Fixed | Image Version |
|---------|-----------|---------------|
| user-service | G1.1 (`skills[]` field), G1.2 (`GET /users/health` public route) | unchanged |
| feed-service | G2.1 (`GET /feed/upload/verify` MinIO stat), G9.1 (`GET /feed/:id` single-post) | `feed-service:v11` |
| job-service | G3.1 (job_applied notification), G3.2 (job_status_changed notification), G6.1 (`JobType` enum + `?type=` filter), G6.2 (job-posted notification), G6.3 (default open-only listing) | `job-service:v4` |
| event-service | G4.1 (`rsvps:[]` in creation response), G4.2 (event-created notification), G4.3 (`DELETE /events/:id/rsvp`), G4.4 (`CANCELLED` status), G4.5 (cancellation fan-out notifications) | `event-service:v3` |
| research-service | G5.1 (`size` field on documents), G5.2 (archived-project upload block), G8.1 (collaboration-invite notification) | `research-service:v8` |
| analytics-service | G7.1 (extended overview fields: `totalUsers`, `openJobs`, `activeResearch`), G7.2 (admin-only RBAC guard) | `analytics-service:v4` |

---

## 🔬 E2E TEST STATUS — ALL GREEN ✅

**Suite:** 10 scenarios · **Total Assertions:** 331 · **Passed:** 331 · **Failed:** 0 · **Gaps:** 0

| Scenario | Description | Integration | Gap Unit Test | Status |
|----------|-------------|-------------|--------------|--------|
| S1 | Student Registers & Manages Profile | 25 pass | — | ✅ |
| S2 | Alumni Posts to Feed (Text + Image) | 21 pass | 14 (`test_s2_gaps.js`) | ✅ |
| S3 | Student Browses Jobs & Applies | 29 pass | 16 (`test_s3_gaps.js`) | ✅ |
| S4 | Admin Creates Event, Students RSVP | 25 pass | 23 (`test_s4_gaps.js`) | ✅ |
| S5 | Research Project & Collaboration | 27 pass | 17 (`test_s5_gaps.js`) | ✅ |
| S6 | Alumni Posts Job Opening | 21 pass | 25 (`test_s6_gaps.js`) | ✅ |
| S7 | Admin Views Analytics Dashboard | 20 pass | 21 (`test_s7_gaps.js`) | ✅ |
| S8 | Full Platform Journey (All Services) | 45 pass | 10 (`test_s8_gaps.js`) | ✅ |
| S9 | Concurrent Multi-User Activity | 14 pass | 16 (`test_s9_gaps.js`) | ✅ |
| S10 | System Resilience & Fault Tolerance | 20 pass | — | ✅ |

Run full suite: `bash tests/e2e/run_all.sh`
Run individual gap test: e.g. `node tests/e2e/test_s6_gaps.js`
Refresh tokens: `bash tests/e2e/setup_personas.sh`

---

## ⏳ REMAINING WORK

### Phase 11 — Documentation & Report (Partial 🟡)
- **Done**: Architecture diagrams (`docs/architecture.md`), load test results, core API docs (`docs/api_infrastructure.md`), E2E test results (`docs/e2e_test_results.md`), integration test log (`docs/integration_test_log.md`)
- **Pending**: API docs for research-service & analytics-service endpoints, Web App architecture section, OpenAPI/Swagger spec sync, Demo script

---

## ⚠️ System Knowledge / Deployment Rules

1. **Deploying code updates** — never reuse the same image tag; increment and use `kubectl set image`:
   ```bash
   eval $(minikube docker-env)
   docker build --no-cache -t <service>:<new_tag> .
   kubectl set image deployment/<service> -n miniproject <service>=<service>:<new_tag>
   kubectl rollout status deployment/<service> -n miniproject --timeout=90s
   # Verify compiled output is actually in the pod before running tests:
   kubectl exec -n miniproject <pod> -- grep -c "newMethod" /app/dist/.../<file>.js
   ```

2. **MongoDB IDs vs Keycloak UUIDs** — Keycloak `sub` = 36-char UUID, stored as `String`. MongoDB `_id` = 24-hex `ObjectId`. **Never** wrap Keycloak IDs in `new Types.ObjectId()`.

3. **Inter-service calls** — guarded by `x-internal-token: miniproject-internal-auth-token` header.  
   Internal URL pattern: `http://<service>.miniproject.svc.cluster.local:<port>/api/v1/internal/...`

4. **Redis-safe pattern** — `RedisService` starts with `available = false`. All cache ops are no-ops when Redis is unreachable; services automatically fall back to MongoDB.

5. **CI lockfile** — root `package-lock.json` covers all 8 microservices. Run `npm install` at the workspace root (`/home/gintoki/Semester07/CO528/mini_project`) to regenerate it.

6. **Token files** — `.e2e_admin_token`, `.e2e_alumni_token`, `.e2e_student_token` in project root. Refresh: `bash tests/e2e/setup_personas.sh`.

7. **Namespace** — all K8s resources live in namespace `miniproject`. Always pass `-n miniproject` to `kubectl` commands.

8. **Ingress host** — `http://miniproject.local/api/v1/<svc>-service/<path>` (must be in `/etc/hosts`).

---

## 📋 Instructions for Next Agent

1. Read this file first before taking any action.
2. For Phase 11 tasks, check `docs/task.md` for what remains.
3. If encountering unexpected cluster behaviour, check `docs/known_issues/errors_log.md`.
4. Always update this file and `docs/e2e_test_results.md` when changes are made.
