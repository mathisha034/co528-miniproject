# Architecture Freeze Document

> **Status**: FROZEN — No changes without explicit review and re-versioning
> **Date**: 2026-03-04 | **Version**: v4.1

---

## Technology Stack (Locked)

| Component | Technology | Version |
|---|---|---|
| Container runtime | Docker | Latest |
| Orchestration | Kubernetes (Minikube for dev) | 1.35+ |
| Auth / Identity | Keycloak | 23.x |
| Database | MongoDB | 6.0 |
| Cache / Pub-Sub | Redis | 7 (Alpine) |
| Object Storage | MinIO | Latest |
| Ingress | NGINX Ingress Controller | Latest |
| TLS | cert-manager + Let's Encrypt | Latest |
| Logging | Grafana Loki + Promtail | Latest |
| Metrics | Prometheus + Grafana | Latest |
| CI/CD | GitHub Actions | — |
| IaC | Terraform | Latest |
| Backend Framework | NestJS (Node.js) | Latest |
| Frontend | React (Vite) | Latest |
| Testing | Jest + Supertest | Latest |
| Load Testing | k6 | Latest |

---

## Service Registry (Locked)

| Service | Internal Port | K8s Service Name | Replicas (initial) |
|---|---|---|---|
| user-service | 3001 | `user-service` | 2 |
| feed-service | 3002 | `feed-service` | 2 |
| job-service | 3003 | `job-service` | 1 |
| event-service | 3004 | `event-service` | 1 |
| messaging-service | 3005 | `messaging-service` | 2 |
| notification-service | 3006 | `notification-service` | 1 |
| research-service | 3007 | `research-service` | 1 |
| analytics-service | 3008 | `analytics-service` | 1 |

---

## Deployment Architecture

```
Internet
   │
   ▼
LoadBalancer (Minikube / Cloud)
   │
   ▼
NGINX Ingress Controller
   │  (TLS termination, rate limiting, path routing)
   ├──► /api/v1/users        → user-service:3001
   ├──► /api/v1/feed         → feed-service:3002
   ├──► /api/v1/jobs         → job-service:3003
   ├──► /api/v1/events       → event-service:3004
   ├──► /api/v1/messages     → messaging-service:3005
   ├──► /api/v1/notifications → notification-service:3006
   ├──► /api/v1/research     → research-service:3007
   ├──► /api/v1/analytics    → analytics-service:3008
   └──► /auth                → keycloak:8080

Internal Cluster (ClusterIP only):
   MongoDB:27017  |  Redis:6379  |  MinIO:9000
   Loki:3100      |  Prometheus:9090  |  Grafana:3000
```

---

## Kubernetes Namespace Strategy

| Namespace | Contents |
|---|---|
| `default` / `dev` | Development deployments |
| `staging` | Pre-production, full test suite runs here |
| `production` | Live workloads |
| `monitoring` | Loki, Prometheus, Grafana |

---

## Secrets Strategy

All credentials stored exclusively in Kubernetes `Secret` objects:

| Secret Name | Contents |
|---|---|
| `mongodb-secret` | `MONGO_URI`, `MONGO_PASSWORD` |
| `keycloak-secret` | `KC_DB_PASSWORD`, `KC_ADMIN_PASSWORD` |
| `minio-secret` | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| `jwt-secret` | `JWT_PUBLIC_KEY` (Keycloak realm public key) |
| `redis-secret` | `REDIS_PASSWORD` (if set) |

---

## Caching Strategy (Redis)

| Data | TTL | Eviction Key Pattern |
|---|---|---|
| Feed page 1 | 60 seconds | `feed:page:1` |
| Analytics summary | 300 seconds | `analytics:summary` |
| Rate limit counters | Per window | Managed by NGINX Ingress |

---

## Database Indexing Strategy

| Collection | Index | Type |
|---|---|---|
| `users` | `email` | Unique |
| `users` | `role` | Standard |
| `posts` | `createdAt` | Descending |
| `posts` | `userId` | Standard |
| `posts` | `(userId, createdAt)` | Compound |
| `jobs` | `status` | Standard |
| `jobs` | `deadline` | Standard |
| `events` | `eventDate` | Standard |
| `notifications` | `userId` | Standard |
| `notifications` | `read` | Standard |

---

## Authentication & Authorization Flow

```
Client → HTTPS → Ingress → Service
              │
              └─► Keycloak (OAuth2 / OIDC)
                    │
                    └─► JWT issued (contains role claim)
                           │
                           └─► Service validates via Keycloak public key
                                  │
                                  └─► Role-based guard (student/alumni/admin)
```

---

## Communication Architecture

| Pattern | Used For |
|---|---|
| REST (HTTP) | All CRUD operations |
| WebSocket (Socket.io) | Real-time messaging |
| Redis Pub/Sub | Distribute WS messages across messaging-service pods |
| Async / internal HTTP | Cross-service notifications (e.g. feed-service → notification-service) |

---

## Backup Strategy

| Aspect | Detail |
|---|---|
| Tool | `mongodump` in a Kubernetes `CronJob` |
| Frequency | Daily at 02:00 UTC |
| Destination | MinIO bucket `backups/` |
| Retention | 7 days |
| RTO | < 1 hour |
| RPO | < 24 hours |
