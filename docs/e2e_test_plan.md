# End-to-End Integration Testing Plan
## CO528 Mini-Project — Microservices Platform

**Revision:** 1.0  
**Date:** 2025  
**Author:** E2E Test Suite (GitHub Copilot assisted)

---

## 1. Scope & Objectives

This document describes the end-to-end (E2E) integration testing strategy for the CO528 Alumni-Student Engagement Platform.

### 1.1 Goals

| Goal | Description |
|------|-------------|
| Functional coverage | Verify that each user-facing scenario executes correctly across all 7 microservices |
| RBAC verification | Confirm that role-based access control blocks unauthorised actions at each endpoint |
| Cross-service data flow | Assert that data written to one service is visible in downstream services |
| Notification delivery | Confirm that asynchronous notifications are dispatched and received |
| Resilience | Verify that pod restarts, dependency outages, and network delays do not cause data loss |
| Implementation gap discovery | Document any functional gaps between specification and implementation |

### 1.2 Out of Scope

- Mobile client E2E (API-level only)
- TLS/certificate validation
- DNS propagation
- Terraform infrastructure provisioning

---

## 2. Test Environment

| Component | Value |
|-----------|-------|
| Cluster | Minikube (single-node) |
| Namespace | `miniproject` |
| Ingress host | `miniproject.local` |
| Ingress path pattern | `/api/v1/<svc>-service/<endpoint>` |
| Auth server | Keycloak `miniproject` realm |
| Auth client | `e2e-test-client` |
| Node.js version | 18+ |
| Test runner | Plain Node.js (no jest/mocha) |

---

## 3. Test Persona Accounts

Three synthetic Keycloak users are created by `tests/e2e/setup_personas.sh` before each run:

| Persona | Username | Email | Realm Role | Represents |
|---------|---------|-------|-------|------------|
| Ashan (student) | `e2e_student` | `ashan@e2e.test` | `student` | First-year CS student |
| Nimali (alumni) | `e2e_alumni` | `nimali@e2e.test` | `alumni` | Employed software engineer |
| Dr. Rajapaksha | `e2e_admin` | `dr.raj@e2e.test` | `admin` | Platform admin / department head |

Password for all personas: `pass123`

Token files written to project root: `.e2e_student_token`, `.e2e_alumni_token`, `.e2e_admin_token`  
Sub UUID files: `.e2e_student_id`, `.e2e_alumni_id`, `.e2e_admin_id`

---

## 4. Service Route Map

| Service | Base URL | Key Endpoints |
|---------|---------|---------------|
| user-service | `/api/v1/user-service/users` | GET/PATCH `me`, GET `:id` (admin), GET `` (admin) |
| feed-service | `/api/v1/feed-service/feed` | POST ``, GET ``, POST `:id/like`, DELETE `:id/like`, POST `upload` |
| job-service | `/api/v1/job-service/jobs` | POST ``, GET ``, GET `:id`, PATCH `:id/status`, POST `:id/apply` (student), PATCH `:id/applications/:id` |
| event-service | `/api/v1/event-service/events` | POST ``, GET ``, GET `:id`, PATCH `:id/status`, POST `:id/rsvp`, GET `:id/attendees` |
| research-service | `/api/v1/research-service/research` | POST ``, GET ``, GET/PATCH/DELETE `:id`, POST `:id/invite`, DELETE `:id/collaborators/:userId`, POST/GET `:id/documents` |
| notification-service | `/api/v1/notification-service/notifications` | GET ``, GET `count`, PATCH `:id/read`, PATCH `read-all` |
| analytics-service | `/api/v1/analytics-service/analytics` | GET `overview`, `posts`, `jobs`, `users`, `latencies` (admin-only) |

---

## 5. Helper Library (`tests/e2e/shared.js`)

| Export | Purpose |
|--------|---------|
| `req(url, method, body, token)` | HTTP request via node:http |
| `reqMultipart(url, buf, filename, mime, token)` | Multipart file upload |
| `assert(label, cond, detail)` | Hard assertion — exits on failure |
| `assertGap(label, detail)` | Records implementation gap — test continues |
| `section(label)` | Console section heading |
| `banner(title)` | Scenario banner |
| `summary(title)` | Print pass/fail/gap counts at end of scenario |
| `loadToken(filename)` | Read JWT from file |
| `getUserId(token)` | Decode JWT and return `sub` (Keycloak UUID) |
| `decodeClaims(token)` | Return full decoded JWT payload |
| `svcUrl(svc, endpoint)` | Build ingress URL |
| `kube(args)` | Run `kubectl` synchronously |
| `waitForPodReady(label, ns, timeout)` | Poll until pod is Running |
| `TINY_JPEG` | 1×1 valid JPEG buffer |

---

## 6. Known Implementation Gaps

The following gaps were identified by reading service source code during test design. Tests use `assertGap()` for these cases (they are recorded but do not fail the suite).

| # | Gap | Affected Scenarios | Service / File |
|---|-----|-------------------|----------------|
| G1 | `UpdateUserDto` has no `skills[]` field (only name, bio, avatar) | S1 | user-service `update-user.dto.ts` |
| G2 | No notification dispatched on `POST /jobs/:id/apply` | S3, S8 | job-service `jobs.service.ts::apply()` |
| G3 | No notification dispatched on application status change | S3 | job-service `jobs.service.ts` |
| G4 | No notification dispatched on `POST /events` | S4 | event-service `events.service.ts` |
| G5 | `EventStatus` enum has no `cancelled` value (only: upcoming, live, ended) | S4 | event-service `event-status.enum.ts` |
| G6 | No `DELETE /events/:id/rsvp` endpoint | S4 | event-service `events.controller.ts` |
| G7 | `InviteCollaboratorDto` has no `role` field (only `userId` UUID) | S5 | research-service `invite-collaborator.dto.ts` |
| G8 | Upload to archived research project is not blocked by service | S5 | research-service `research.service.ts` |
| G9 | MinIO bucket file not verifiable from test runner (internal-only) | S2, S5 | MinIO networking |
| G10 | `GET /analytics/overview` is not admin-only (open to all auth users) | S7 | analytics-service `analytics.controller.ts` |
| G11 | Analytics `overview` response shape is `{users,posts,jobs,events}`, not `totalUsers/openJobs/activeResearch` | S7 | analytics-service |
| G12 | `GET /jobs` returns closed jobs (no default status filter) | S6 | job-service `jobs.service.ts::findAll()` |
| G13 | No "new job posted" broadcast notification to students | S6 | job-service (no dispatch in `create()`) |
| G14 | `POST /feed/upload` → MinIO-down error may be 500 instead of 503 | S10 | feed-service error handling |

---

## 7. Scenario Index

| ID | Title | Actors | Key Services | Assertions | File |
|----|-------|--------|-------------|------------|------|
| S1 | Registration & Onboarding | Student | user | 23 | `test_s1.js` |
| S2 | Alumni Posts to Feed | Alumni | feed, notification | 21 | `test_s2.js` |
| S3 | Student Applies for Job | Student, Admin | job, notification | 29 | `test_s3.js` |
| S4 | Events RSVP | Student, Admin | event, notification | 23 | `test_s4.js` |
| S5 | Research Collaboration | Student, Alumni, Admin | research, notification | 27 | `test_s5.js` |
| S6 | Alumni Posts a Job | Alumni, Student | job, notification | 20 | `test_s6.js` |
| S7 | Analytics Dashboard | Admin, Student, Alumni | analytics | 20 | `test_s7.js` |
| S8 | Full Platform Journey | All 3 | all 7 services | 45 | `test_s8.js` |
| S9 | Concurrent Activity | All 3 | feed, job, event, analytics, notification | 14 | `test_s9.js` |
| S10 | System Resilience | Admin, Student | all + kubectl | 20 | `test_s10.js` |

**Total assertions: ~242**

---

## 8. RBAC Matrix

| Endpoint | student | alumni | admin | unauth |
|----------|---------|--------|-------|--------|
| GET /users/me | ✔ | ✔ | ✔ | 401 |
| GET /users | 403 | 403 | ✔ | 401 |
| PATCH /users/me | ✔ | ✔ | ✔ | 401 |
| GET /users/:id | 403 | 403 | ✔ | 401 |
| POST /feed | 403 | ✔ | ✔ | 401 |
| GET /feed | ✔ | ✔ | ✔ | 401 |
| POST /feed/:id/like | ✔ | ✔ | ✔ | 401 |
| POST /feed/upload | 403 | ✔ | ✔ | 401 |
| POST /jobs | 403 | ✔ | ✔ | 401 |
| GET /jobs | ✔ | ✔ | ✔ | 401 |
| POST /jobs/:id/apply | ✔ | 403 | 403 | 401 |
| GET /jobs/:id/applications | 403 | ✔ (owner) | ✔ | 401 |
| PATCH /jobs/:id/applications/:appId | 403 | ✔ | ✔ | 401 |
| POST /events | 403 | ✔ | ✔ | 401 |
| GET /events | ✔ | ✔ | ✔ | 401 |
| POST /events/:id/rsvp | ✔ | ✔ | ✔ | 401 |
| GET /events/:id/attendees | 403 | ✔ | ✔ | 401 |
| POST /research | ✔ | ✔ | ✔ | 401 |
| GET /research | ✔ | ✔ | ✔ | 401 |
| POST /research/:id/invite | owner only | owner only | ✔ | 401 |
| GET /analytics/overview | ✔ | ✔ | ✔ | 401 |
| GET /analytics/latencies | 403 | 403 | ✔ | 401 |
| GET /notifications | ✔ | ✔ | ✔ | 401 |

---

## 9. Notification Dispatch Matrix

| Trigger | Source service | Notification type | Recipient |
|---------|-------------|------------------|-----------|
| POST /feed/:id/like | feed-service | `like` | Post author |
| POST /research/:id/invite | research-service | `COLLABORATION_INVITE` | Invited user |

All other event triggers (job apply, job status update, event creation, job creation) do **not** dispatch notifications in the current implementation (see gaps G2–G4, G13).

---

## 10. Data Flow Verification

```
S8 Full Journey represents the golden-path data flow:

[Keycloak]──JWT──▶[user-service]──profile──▶verified
                                                │
[feed-service]◀──post──[alumni]                │
      │◀──like──[student]                       │
      │──notify──▶[notification-service]         │
                        ▲                        │
[research-service]──invite──[admin]            │
      │──documents──[MinIO]                     │
      │──notify──▶[notification-service]         │
                                                 │
[job-service]──post──[admin]                   │
      │──apply──[student]                       │
      │──status──[admin]                        │
                                                 │
[event-service]──create──[admin]               │
      │──rsvp──[student]                        │
                                                 │
[analytics-service]◀──aggregates──all writes
```

---

## 11. Run Instructions

### Prerequisites

```bash
# 1. Ensure minikube is running and miniproject namespace exists
minikube status
kubectl get ns miniproject

# 2. Ensure ingress is configured
grep miniproject.local /etc/hosts  # should resolve to minikube IP

# 3. Ensure Node.js 18+ is available
node --version
```

### Run All Scenarios

```bash
# Run all 10 scenarios (includes persona setup)
bash tests/e2e/run_all.sh

# Skip persona setup if tokens already exist
bash tests/e2e/run_all.sh --skip-setup

# Run only specific scenarios
bash tests/e2e/run_all.sh --only S3,S7 --skip-setup

# Stop on first failure
bash tests/e2e/run_all.sh --bail
```

### Run a Single Scenario

```bash
node tests/e2e/test_s3.js
```

### Log Files

Per-run logs are written to `/tmp/e2e_s{N}_results.txt`.

---

## 12. Pass/Fail Criteria

| Symbol | Meaning |
|--------|---------|
| `✔` | Assertion passed |
| `✘` | Assertion failed (test exits with code 1) |
| `⚠` | Gap recorded (test continues, gap noted in summary) |

A scenario is **PASS** if it exits with code 0 (all `assert()` calls succeeded).  
A scenario **FAIL** if any `assert()` call fails.  
`assertGap()` calls never cause failure.

---

## 13. Assertion Naming Convention

All assertion labels follow the pattern: `S{N}.{seq}  {summary}`

Examples:
- `S3.04  Student: POST /jobs/:id/apply → 201` — hard assertion
- `S4.gap  "cancelled" EventStatus not in enum` — gap record

---

## 14. Concurrency Test Design (S9)

Parallel requests are fired using `Promise.all`:

- **T1:** 5 concurrent `POST /feed` → verify 5 unique ids
- **T2:** 10 concurrent `GET /feed` → verify all 200, same count (cache consistency)
- **T3:** 5 concurrent `GET /analytics/overview` → verify same user count
- **T4:** 5 concurrent `POST /feed/:id/like` from same user → verify likeCount = 1
- **T5:** 8 concurrent `GET /jobs` → verify same count
- **T6:** 20 concurrent `GET /events` → all 200
- **T7:** 5 concurrent `GET /notifications` → consistent data
- **T8:** Assert 0 server errors (5xx) across all concurrent responses

---

## 15. Resilience Test Design (S10)

| Failure | Injection method | Expected behaviour | Recovery |
|---------|-----------------|---------------------|----------|
| F1: MongoDB pod killed | `kubectl delete pod mongodb-0 --force` | Other services degrade; recovers in < 60s | StatefulSet recreates pod |
| F2: feed-service pod deleted | `kubectl delete pod feed-xxx --force` | Feed unavailable briefly; recovers in < 60s | Deployment recreates pod |
| F3: Redis scaled to 0 | `kubectl scale deployment redis --replicas=0` | GET /feed falls back to MongoDB direct | Scale back to 1 |
| F4: MinIO scaled to 0 | `kubectl scale deployment minio --replicas=0` | Upload returns 5xx; text posts still work | Scale back to 1 |
| F5: netem +100ms | `kubectl exec ... tc qdisc add dev eth0 root netem delay 100ms` | All services respond < 2000ms | Remove qdisc |

---

*Document generated alongside test files. Re-run `bash tests/e2e/run_all.sh` to reproduce results.*
