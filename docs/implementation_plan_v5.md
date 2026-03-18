# DECP — Implementation Plan v5.0

> Updated: 2026-03-08 | Architecture revision introducing Research Collaboration Service, Analytics Service, Web Application, and explicit Job/Event service split.

---

## Background

This plan supersedes v4.2. Key changes from the previous version:

- **Job Service** and **Event Service** are now explicitly documented as two separate services (they were already deployed separately in v4.2).
- **Research Collaboration Service** (`/services/research-service`) — scaffolded, needs full domain implementation.
- **Analytics Service** (`/services/analytics-service`) — scaffolded, needs full domain implementation.
- **Web Application** (`/web`) — empty directory, full React SPA to be built.
- Phase numbering revised to follow the new 12-phase roadmap.

---

## Completion Status at v5.0

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Architecture Freeze | ✅ Done |
| 1 | Dev Environment Setup | ✅ Done |
| 2.1–2.5 | Core Services (User, Feed, Job, Event, Notification) | ✅ Done |
| 2.6 | Research Collaboration Service | 🔴 Not started (scaffolded only) |
| 2.7 | Analytics Service | 🔴 Not started (scaffolded only) |
| 3 | Cross-Cutting Features | ✅ Done |
| 4 | Kubernetes Deployment | ✅ Done |
| 5 | Backup & Recovery | ✅ Done |
| 6 | CI/CD & Terraform | ✅ Done |
| 7 | Performance & Scalability | ✅ Done |
| 8 | Security Hardening | ✅ Done |
| 9 | Web Application (React SPA) | 🔴 Not started (web/ empty) |
| 10 | Final Integration & Stability | 🔴 Blocked on Phase 9 |
| 11 | Documentation & Report | 🟡 Partial (services documented; web app missing) |

### SPECIAL NOTE (2026-03-18) — Security/Authentication Ingress Update

- **From (existing implementation):** Login/auth commonly accessed via HTTP ingress (`http://miniproject.local/auth`).
- **To (new implementation):** TLS-enabled HTTPS ingress with forced SSL redirects (`https://miniproject.local/auth`) using cert-manager certificate secret `miniproject-tls-secret`.
- **Why this modification was required:** Keycloak session cookies are issued with secure attributes and browser policies can break login callback continuity on non-HTTPS auth flows, resulting in `Cookie not found` during authentication.
- **Compatibility note:** Frontend Keycloak config remains `url: '/auth'`; protocol is now controlled by ingress, so no environment-specific frontend hardcoding is needed.

---

## Proposed Changes

### Phase 2.6 — Research Collaboration Service

#### [MODIFY] research-service/src

Currently only scaffolded. Add:

- `research/research.schema.ts` — Mongoose schema (title, ownerId, collaborators[], status, documents[], tags)
- `research/research.controller.ts` — REST endpoints (CRUD + invite + document upload)
- `research/research.service.ts` — Business logic, MinIO integration for `research-docs` bucket
- `research/research.module.ts`
- `auth/` — JWT strategy (same pattern as other services)
- Unit tests in `test/`

**API surface:**
```
POST   /api/v1/research
GET    /api/v1/research
GET    /api/v1/research/:id
PATCH  /api/v1/research/:id
DELETE /api/v1/research/:id
POST   /api/v1/research/:id/invite
DELETE /api/v1/research/:id/collaborators/:userId
POST   /api/v1/research/:id/documents
GET    /api/v1/research/:id/documents
```

**Data model:**
```json
{
  "_id": "ObjectId",
  "title": "string",
  "description": "string",
  "ownerId": "string",
  "collaborators": ["userId"],
  "status": "active | completed | archived",
  "documents": [{ "name": "string", "minioKey": "string", "uploadedAt": "Date" }],
  "tags": ["string"],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

---

### Phase 2.7 — Analytics Service

#### [MODIFY] analytics-service/src

Currently only scaffolded. Add:

- `analytics/analytics.controller.ts` — 4 GET endpoints
- `analytics/analytics.service.ts` — MongoDB read-only aggregations + Prometheus HTTP client
- `analytics/analytics.module.ts`
- `auth/` — JWT strategy
- Unit tests

**API surface:**
```
GET /api/v1/analytics/overview   → { users, posts, jobs, events }
GET /api/v1/analytics/posts      → popular posts by likes/comments
GET /api/v1/analytics/jobs       → application counts per job
GET /api/v1/analytics/users      → new registrations over time
```

---

### Phase 9 — Web Application (React SPA)

#### [NEW] web/

Bootstrap with Vite + React + TypeScript. Pages:

| Page | Route | Services Consumed |
|------|-------|-------------------|
| Dashboard | `/` | User, health endpoints, Feed |
| Feed | `/feed` | Feed Service, MinIO |
| Jobs | `/jobs` | Job Service |
| Events | `/events` | Event Service, Notification |
| Research | `/research` | Research Service, MinIO |
| Notifications | `/notifications` | Notification Service |
| Profile | `/profile` | User Service, Keycloak |
| Analytics (admin) | `/analytics` | Analytics Service |
| Infrastructure | `/infra` | Prometheus, health endpoints |

**Key technical requirements:**
- Keycloak JS adapter (Authorization Code Flow + PKCE)
- JWT stored in memory only (never localStorage)
- Axios instance with request interceptor attaching `Authorization: Bearer`
- Protected routes with role guards (student / alumni / admin)
- CSS design system: Syne display font + DM Sans body, color tokens
- Fully responsive (sidebar collapses on mobile)

---

### Phase 10 — Integration & Stability Updates

- Full integration sequence expands to include Research Service, Analytics Service, and Web App
- 5 failure simulation scenarios applied across all 8 services including new ones
- Full E2E journey from Phase 9.12 must pass after every recovery

### Phase 11 — Documentation

- Add Research Service API docs
- Add Analytics Service API docs
- Add Web App architecture section (component tree, routing, auth flow)
- Add demo script following journey in Phase 9.12

---

## Verification Plan

### Phase 2.6 — Research Service
- Unit: Jest — schema validates, MinIO upload mocked, collaborator RBAC enforced
- Integration: Real uploads to `research-docs` MinIO bucket; `explain()` on ownerId/status indexes
- Regression: All prior service health checks still 200

### Phase 2.7 — Analytics Service
- Unit: Jest — MongoDB aggregation shape correct; Prometheus client mocked
- Integration: Seeded data → counts match; live Prometheus metrics returned
- Regression: Source services (Feed, Job, Event) unaffected by read-only queries

### Phase 9 — Web Application
- Unit: React Testing Library per page component
- E2E: Full journey (login → post → apply → RSVP → notifications → research → analytics)
- Browser automation: Playwright on staging environment
- Regression: Backend services unaffected by frontend traffic

### Phase 10 — Final Stability
- All 5 failure scenarios (MongoDB, Feed pod, network delay, Redis, MinIO)
- Full E2E journey still passes after each recovery
