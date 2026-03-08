# MiniProject — Alumni & Student Social Platform

A full-stack, cloud-native social networking platform built for university alumni and students. It enables community interaction through social feeds, job boards, event management, real-time messaging, research collaboration, and rich analytics — all running on a Kubernetes-orchestrated microservices architecture.

---

## Table of Contents

- [What Is This?](#what-is-this)
- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Services & API Endpoints](#services--api-endpoints)
- [Data Models](#data-models)
- [User Roles](#user-roles)
- [Non-Functional Properties](#non-functional-properties)
- [Prerequisites](#prerequisites)
- [Running Locally (Minikube)](#running-locally-minikube)
- [Running with Docker Compose (Dev)](#running-with-docker-compose-dev)
- [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Observability](#observability)
- [Configuration & Secrets](#configuration--secrets)

---

## What Is This?

MiniProject is a microservices-based social platform connecting university students and alumni. Think LinkedIn meets a university intranet — users can post updates, find jobs, attend events, collaborate on research, and message each other in real-time. Admins get a full analytics dashboard.

It was designed as a demonstration of modern cloud-native architecture: every feature is isolated into its own independently deployable service, fronted by NGINX, secured by Keycloak (OAuth2/OIDC), and observable via Prometheus + Grafana + Loki.

---

## Features

| Feature | Description |
|---|---|
| **Social Feed** | Create posts with images, like, comment, paginated timeline |
| **Job Board** | Alumni/admins post openings; students apply; status tracking |
| **Events** | Create, RSVP, live/ended lifecycle, attendee management |
| **Real-Time Messaging** | WebSocket-based chat with Redis Pub/Sub fan-out |
| **Research Collaboration** | Projects, document uploads, invite collaborators |
| **Notifications** | Async in-app alerts for likes, comments, jobs, events |
| **Analytics Dashboard** | Admin-only: user stats, popular posts, job/event metrics |
| **User Profiles** | Avatar upload, bio, department, role badges |
| **Auth (SSO)** | Keycloak OIDC — single login works across all services |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser / Mobile Client                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NGINX Ingress Controller                      │
│         TLS termination · Rate limiting · Path routing          │
└──┬───────────────┬────────────────────────────┬─────────────────┘
   │ /auth         │ /api/v1/*                  │ /* (React SPA)
   ▼               ▼                            ▼
┌──────────┐  ┌─────────────────────────────────────────────────┐
│ Keycloak │  │              Microservices Layer                 │
│  (OIDC)  │  │                                                  │
└──────────┘  │  user-service      :3001  /api/v1/users         │
              │  feed-service      :3002  /api/v1/feed          │
              │  job-service       :3003  /api/v1/jobs          │
              │  event-service     :3004  /api/v1/events        │
              │  messaging-service :3005  /api/v1/messages      │
              │  notification-svc  :3006  /api/v1/notifications │
              │  research-service  :3007  /api/v1/research      │
              │  analytics-service :3008  /api/v1/analytics     │
              └──────────────────┬──────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
       ┌────────────┐   ┌─────────────┐   ┌──────────────┐
       │  MongoDB   │   │    Redis    │   │    MinIO     │
       │ (primary   │   │  (cache +   │   │  (S3-compat  │
       │  database) │   │  pub/sub)   │   │  file store) │
       └────────────┘   └─────────────┘   └──────────────┘
```

**Key design principles:**
- Each service owns its bounded context and MongoDB collections
- Services communicate via internal HTTP calls (no message broker)
- Auth is stateless — every service validates the JWT locally using Keycloak's public key
- Redis caches hot feed pages (TTL 60s) and powers WebSocket fan-out for messaging
- MinIO stores all binary blobs: post images, avatars, research documents

---

## Technology Stack

### Backend Services
| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 18 LTS | Runtime for all services |
| **NestJS** | 11 | Framework (DI, guards, interceptors, pipes) |
| **TypeScript** | 5 | Language for all backend code |
| **Mongoose** | 9 | MongoDB ODM |
| **Passport.js + JWT** | — | Auth middleware, JWT extraction |
| **@nestjs/throttler** | 6 | Per-service rate limiting |
| **prom-client** | 15 | Prometheus metrics `/metrics` endpoint |
| **Winston** | — | Structured request logging |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19 | UI framework |
| **TypeScript** | 5 | Language |
| **Vite** | 5 | Dev server and bundler |
| **React Router DOM** | 7 | Client-side routing |
| **Axios** | 1 | HTTP client with interceptors |
| **keycloak-js** | 26 | OIDC auth client |
| **Lucide React** | — | Icons |
| **Recharts** | 3 | Analytics charts |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Kubernetes (Minikube)** | Container orchestration |
| **NGINX Ingress Controller** | Reverse proxy, TLS, rate limiting |
| **Keycloak 23** | Identity Provider (OAuth2/OIDC/JWT) |
| **MongoDB 6** | Primary NoSQL document store |
| **Redis 7** | Cache + WebSocket Pub/Sub |
| **MinIO** | S3-compatible object storage |
| **Prometheus** | Metrics scraping |
| **Grafana** | Dashboards (CPU, latency, error rates) |
| **Loki + Promtail** | Log aggregation |
| **cert-manager** | TLS certificate automation |
| **Docker** | Container images |
| **Terraform** | Infrastructure-as-code |
| **k6** | Load / stress testing |

---

## Project Structure

```
mini_project/
├── web/                        # React + Vite frontend
│   └── src/
│       ├── pages/              # Feed, Jobs, Events, Research, Notifications, ...
│       ├── components/         # Layout, Topbar, Sidebar, shared UI
│       ├── contexts/           # AuthContext, SearchContext
│       └── lib/                # axios instance, keycloak setup
│
├── services/
│   ├── user-service/           # Profile management
│   ├── feed-service/           # Posts, likes, comments + MinIO images
│   ├── job-service/            # Job postings & applications
│   ├── event-service/          # Events & RSVP lifecycle
│   ├── messaging-service/      # WebSocket chat + Redis Pub/Sub
│   ├── notification-service/   # Async in-app notifications
│   ├── research-service/       # Projects, docs, collaborators
│   └── analytics-service/      # Admin aggregation dashboard
│
├── infra/
│   ├── docker-compose.yml      # Local dev: Keycloak, Mongo, Redis, MinIO
│   ├── nginx.conf              # NGINX config
│   ├── prometheus/             # Prometheus scrape config
│   ├── grafana/                # Grafana provisioning
│   ├── loki/                   # Loki + Promtail configs
│   └── backup/                 # mongodump backup/restore scripts
│
├── k8s/
│   ├── namespace.yaml
│   ├── ingress.yaml
│   ├── network-policy.yaml
│   ├── infra/                  # MongoDB, Redis, MinIO, Keycloak K8s manifests
│   ├── services/               # Per-service Deployments, Services, HPAs
│   └── secrets/                # JWT, Keycloak, MinIO, MongoDB secrets
│
├── load-tests/                 # k6 baseline and stress test scripts
├── tests/                      # E2E test scripts
└── terraform/                  # Cloud infra-as-code (main.tf, variables.tf)
```

---

## Services & API Endpoints

All endpoints are prefixed with `/api/v1/` and require `Authorization: Bearer <JWT>` unless noted.

### User Service — `/api/v1/users`
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/me` | any | Get logged-in user's profile |
| `PATCH` | `/me` | any | Update name, bio, department, avatar |
| `GET` | `/:id` | admin | Get any user's profile |
| `GET` | `/` | admin | List all users |

### Feed Service — `/api/v1/feed`
| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/` | any | Create a post (with optional image) |
| `GET` | `/` | any | Paginated feed (`?page=1&limit=10`) |
| `POST` | `/:id/like` | any | Like a post (idempotent) |
| `DELETE` | `/:id/like` | any | Unlike a post |
| `POST` | `/:id/comments` | any | Comment on a post |
| `GET` | `/:id/comments` | any | Get comments for a post |
| `POST` | `/upload-url` | any | Get presigned MinIO URL for image upload |

### Job Service — `/api/v1/jobs`
| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/` | alumni / admin | Create a job posting |
| `GET` | `/` | any | List all jobs |
| `GET` | `/:id` | any | Get job details |
| `POST` | `/:id/apply` | student | Apply with cover letter |
| `PATCH` | `/:id/applications/:appId` | alumni / admin | Update application status |

### Event Service — `/api/v1/events`
| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/` | alumni / admin | Create event |
| `GET` | `/` | any | List events (sorted by date) |
| `GET` | `/:id` | any | Get event details |
| `PATCH` | `/:id/status` | alumni / admin | Advance status (`upcoming→live→ended`) |
| `POST` | `/:id/rsvp` | any | RSVP (idempotent `$addToSet`) |
| `DELETE` | `/:id/rsvp` | any | Cancel RSVP |
| `GET` | `/:id/attendees` | alumni / admin | List RSVP'd user IDs |

### Messaging Service — `/api/v1/messages`
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/:conversationId` | any | Fetch message history |
| `WS` | `/ws` | any | Real-time bidirectional chat |

### Notification Service — `/api/v1/notifications`
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/` | any | Get own notifications |
| `PATCH` | `/:id/read` | any | Mark notification as read |

### Research Service — `/api/v1/research`
| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/` | any | Create research project |
| `GET` | `/` | any | List own / collaborated projects |
| `GET` | `/:id` | collaborator / admin | Get project details |
| `POST` | `/:id/invite` | owner / admin | Invite collaborator |
| `POST` | `/:id/documents` | collaborator | Upload document to MinIO |

### Analytics Service — `/api/v1/analytics`
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/overview` | admin | Overall stats (users, posts, jobs, events) |
| `GET` | `/posts` | admin | Popular posts breakdown |
| `GET` | `/jobs` | admin | Job application statistics |

---

## Data Models

<details>
<summary><strong>User</strong></summary>

```json
{
  "_id": "ObjectId",
  "keycloakId": "string (unique, indexed)",
  "email": "string (unique, indexed)",
  "name": "string",
  "role": "student | alumni | admin",
  "bio": "string",
  "department": "string",
  "avatar": "string (MinIO URL)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```
</details>

<details>
<summary><strong>Post (Feed)</strong></summary>

```json
{
  "_id": "ObjectId",
  "userId": "string (Keycloak sub, indexed)",
  "content": "string",
  "imageUrl": "string (MinIO presigned URL, optional)",
  "likes": ["string (userId)"],
  "commentCount": "number",
  "createdAt": "Date (indexed desc)"
}
```
</details>

<details>
<summary><strong>Job & Application</strong></summary>

```json
{
  "_id": "ObjectId",
  "postedBy": "string",
  "title": "string",
  "company": "string",
  "description": "string",
  "requirements": ["string"],
  "status": "open | closed",
  "deadline": "Date (indexed)",
  "applications": [{
    "_id": "ObjectId",
    "applicantId": "string",
    "status": "pending | reviewed | accepted | rejected",
    "coverLetter": "string",
    "appliedAt": "Date"
  }]
}
```
</details>

<details>
<summary><strong>Event</strong></summary>

```json
{
  "_id": "ObjectId",
  "createdBy": "string (Keycloak sub)",
  "title": "string",
  "description": "string",
  "eventDate": "Date (indexed)",
  "location": "string",
  "format": "in-person | online | hybrid",
  "status": "upcoming | live | ended | cancelled",
  "rsvps": ["string (userId)"]
}
```
</details>

<details>
<summary><strong>Notification</strong></summary>

```json
{
  "_id": "ObjectId",
  "userId": "string",
  "type": "post_liked | comment_added | job_posted | application_update | general | event_status_changed",
  "message": "string",
  "isRead": "boolean",
  "createdAt": "Date"
}
```
</details>

<details>
<summary><strong>Research Project</strong></summary>

```json
{
  "_id": "ObjectId",
  "ownerId": "string",
  "title": "string",
  "description": "string",
  "collaborators": [{ "userId": "string", "email": "string", "name": "string" }],
  "documents": [{ "name": "string", "url": "string", "size": "number" }],
  "createdAt": "Date"
}
```
</details>

---

## User Roles

| Role | Permissions |
|---|---|
| `student` | View feed · Apply for jobs · RSVP events · Message · Collaborate on research |
| `alumni` | All student permissions + **Post jobs** · **Create events** |
| `admin` | Full access + **Analytics dashboard** · **Manage users** · **Update event status** |

Roles are managed in Keycloak realm roles and propagated via JWT claims. Each service enforces roles via `RolesGuard` + `@Roles(...)` decorators.

---

## Non-Functional Properties

| Concern | Target / Implementation |
|---|---|
| **API latency (p95)** | < 500ms |
| **Cached feed load** | < 100ms (Redis) |
| **WebSocket message** | < 200ms |
| **Availability** | 99.5% — rolling deploys, pod self-healing |
| **Horizontal scaling** | HPA: 70% CPU trigger, up to 10 replicas per service |
| **Rate limiting** | NGINX: 10 req/s per IP, burst 20 |
| **Auth** | OAuth2/OIDC via Keycloak, RS256-signed JWTs |
| **Secrets** | Kubernetes `Secret` objects only (never in config files) |
| **Containers** | Non-root `securityContext.runAsNonRoot: true` |
| **DB backups** | Daily `mongodump` CronJob · 7-day retention in MinIO |
| **RTO / RPO** | < 1 hour / < 24 hours |

---

## Prerequisites

Make sure you have all of the following installed:

```bash
# Required
docker          >= 24
kubectl         >= 1.28
minikube        >= 1.32
helm            >= 3.12
node            >= 18 LTS
npm             >= 9

# Optional (for infra-as-code / load testing)
terraform       >= 1.5
k6              >= 0.46
```

---

## Running Locally (Minikube)

### 1. Start Minikube

```bash
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
```

### 2. Add hosts entry

```bash
echo "$(minikube ip) miniproject.local" | sudo tee -a /etc/hosts
```

### 3. Point Docker at Minikube's daemon

```bash
eval $(minikube docker-env)
```

### 4. Build all service images

```bash
# From repo root — build each service
for svc in user-service feed-service job-service event-service \
            messaging-service notification-service research-service analytics-service; do
  docker build -t miniproject/$svc:latest services/$svc/
done

# Build the frontend
docker build -t miniproject/web:latest web/
```

### 5. Deploy to Kubernetes

```bash
# Infrastructure (MongoDB, Redis, MinIO, Keycloak)
kubectl apply -k k8s/infra/

# Secrets
kubectl apply -k k8s/secrets/

# Application services
kubectl apply -k k8s/services/

# Ingress, network policies, HPAs
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/network-policy.yaml
```

### 6. Set up Keycloak

```bash
# Wait for Keycloak to be ready
kubectl wait --for=condition=ready pod -l app=keycloak -n miniproject --timeout=120s

# Run the realm + user setup script
bash infra/setup-keycloak.sh
```

### 7. Access the app

```
http://miniproject.local         → React frontend
http://miniproject.local/auth    → Keycloak admin console
```

**Default Keycloak admin:** `admin` / `admin`

---

## Running with Docker Compose (Dev)

For quick local development of individual services, spin up only the infrastructure:

```bash
cd infra
docker compose up -d
```

This starts: PostgreSQL (for Keycloak), Keycloak on `:8081`, MongoDB on `:27017`, Redis on `:6379`, MinIO on `:9000`.

Then run any service individually:

```bash
cd services/user-service
npm install
npm run start:dev
```

---

## Frontend Development

The React app uses Vite and proxies all `/api` and `/auth` requests to `miniproject.local`:

```bash
cd web
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server enables Hot Module Replacement — all source changes reflect immediately without a page reload.

**Key frontend source files:**

| File | Purpose |
|---|---|
| `src/lib/keycloak.ts` | Keycloak OIDC client singleton |
| `src/lib/axios.ts` | Axios instance with auth token interceptor |
| `src/contexts/AuthContext.tsx` | Global auth state, `user.sub`, roles |
| `src/contexts/SearchContext.tsx` | Global search query state |
| `src/pages/Dashboard/` | Stats overview (admin + non-admin views) |
| `src/pages/Feed/` | Social posts, likes, comments |
| `src/pages/Jobs/` | Job listings and applications |
| `src/pages/Events/` | Events, RSVP |
| `src/pages/Research/` | Research projects and documents |
| `src/pages/Notifications/` | In-app notification inbox |
| `src/pages/Profile/` | User profile edit |

---

## Testing

### Unit Tests (per service)

```bash
cd services/feed-service
npm test
npm run test:cov    # with coverage
```

### E2E Tests

```bash
# Full journey test against running cluster
node tests/test_e2e.js

# Or via shell script
bash tests/run_curl_test.sh
```

### Load Tests (k6)

```bash
# Baseline (light load)
k6 run load-tests/baseline.js

# Stress test (ramp to 500 VUs)
k6 run load-tests/stress.js
```

---

## Observability

Once deployed, the observability stack is accessible at:

| Tool | URL | Purpose |
|---|---|---|
| **Grafana** | `http://miniproject.local/grafana` | Dashboards: latency, error rate, pod CPU/RAM |
| **Prometheus** | `http://miniproject.local/prometheus` | Raw metrics browser |
| **Loki (via Grafana)** | Inside Grafana | Structured log search |

Each service exposes:
- `GET /health` — liveness probe
- `GET /ready` — readiness probe  
- `GET /metrics` — Prometheus scrape endpoint

---

## Configuration & Secrets

All sensitive configuration is stored as Kubernetes Secrets in `k8s/secrets/`. **Never commit real secret values.**

| Secret | Contains |
|---|---|
| `jwt-secret` | JWT public key for token verification |
| `mongodb-secret` | MongoDB connection URI |
| `redis-secret` | Redis connection string |
| `minio-secret` | MinIO access key + secret key |
| `keycloak-secret` | Keycloak admin credentials |

Environment variables are injected into each service pod via `envFrom.secretRef` in the Deployment manifests. See `k8s/services/<service-name>/deployment.yaml` for the full list per service.

---

## License

This project is for academic purposes (CO528 — University module). Not licensed for production use.
