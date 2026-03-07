# Project Implementation Plan (v4.1 — Final Cloud-Ready Architecture)

> **Version**: v4.1 | **Last Updated**: 2026-03-04
> This is the frozen architecture document. Changes require explicit review and a new version.

---

## 📋 Implementation Guidance — Read Before Starting Any Phase

> [!IMPORTANT]
> **Before implementing any phase, always consult previous versioned plan documents stored in the project `/docs` directory.**
>
> Each previous version (`v1.0`, `v2.0`, `v2.1`, `v3.0`, `v4.0`) may contain:
> - More detailed requirements for specific features
> - Earlier design decisions with rationale
> - Specific configuration values, schema designs, or service-level details not reproduced here for brevity
>
> **Recommended lookup procedure when starting a phase:**
> 1. Open the current phase section in this document.
> 2. Cross-reference `/docs/implementation_plan_v*.md` files for any service or feature covered in that phase.
> 3. If conflicting information exists, **this v4.1 document takes precedence** — but older documents can still provide implementation detail not captured here.
>
> This ensures nothing is lost across plan revisions and implementation remains comprehensive.

---

## 🏗 Architecture Overview

### Architectural Style
- Microservices, Cloud-Native, Containerized, Kubernetes-Orchestrated
- Event-Driven Communication (where applicable)
- API-First Design
- Each service is: independently deployable, stateless, horizontally scalable, observable

### 7 Logical Layers
| Layer | Contents |
|---|---|
| **1. Client** | Web browser, Mobile app, API clients |
| **2. Edge & Traffic** | NGINX Ingress, Cert-Manager, Let's Encrypt |
| **3. Identity & Security** | Keycloak (OAuth2 / OIDC / RBAC / JWT) |
| **4. Application** | `user`, `feed`, `job`, `event`, `research`, `messaging`, `notification`, `analytics` |
| **5. Data** | MongoDB (StatefulSet + PVC), Redis (Cache + Pub/Sub), MinIO (Object Storage) |
| **6. Observability** | Prometheus, Grafana, Loki, Promtail |
| **7. Infrastructure & Automation** | Docker Hub, GitHub Actions, Terraform |

---

## 🔑 Key Architecture Decisions

### Identity & Security
- Keycloak with OAuth2 / OIDC for token issuance
- All microservices validate JWTs via Keycloak public key; no session state
- Zero-trust internal model; mTLS as a future enhancement

### API Design
- All routes versioned: `/api/v1/<resource>`
- OpenAPI documentation per service
- Backward compatibility maintained

### Database Indexing Strategy
| Service | Indexes |
|---|---|
| User | `email` (unique), `role` |
| Feed | `userId`, `createdAt`, compound `(userId, createdAt)` |
| Job/Event | `status`, `deadline` |

### Caching Strategy (Redis)
- Feed pages: TTL-based cache
- Analytics results: TTL-based cache
- Redis configured with memory eviction policy

### Secrets Management
- All credentials in Kubernetes `Secret` objects
- Never hard-coded in YAML or application code
- Rotation documented

### Resilience
- Retry with exponential backoff on notification/event failures
- Dead-letter queue simulation for unprocessable events

---

## 📆 Phase-by-Phase Implementation Plan

---

### Phase 0 — Requirements Finalization & Architecture Freeze
**Goal**: Lock architecture before writing any code.

**Tasks**:
- **0.1 Functional Requirements**: Define all user flows, API endpoint list, data models per service, roles & permissions, and edge cases.
- **0.2 Non-Functional Requirements**: Define concurrency targets, response time SLAs, availability target, backup frequency, and security requirements.
- **0.3 Architecture Freeze**: Document complete service list, DB selection, caching strategy, auth strategy, logging strategy, and deployment model. Finalize technology stack: Keycloak, MongoDB, Redis, MinIO, NGINX Ingress, Loki, Prometheus, GitHub Actions, Terraform.
- **0.4 Deliverables**: Architecture document, OpenAPI contracts, DB schema, ER diagram, data flow diagram.

> [!IMPORTANT]
> No architecture changes are permitted after this phase without formal review and re-versioning.

---

### Phase 1 — Development Environment Setup
**Goal**: Full system runnable locally.

**Tasks**:
- **1.1 Repository Structure**:
  ```
  /user-service
  /feed-service
  /event-service
  /notification-service
  /k8s
  /docker
  /terraform
  /docs
  ```
- **1.2 Dockerfiles**: One per service. Must use a non-root container user, define all environment variables, and expose correct ports.
- **1.3 Docker Compose**: Includes MongoDB, Redis, MinIO, Keycloak, and all microservices. Used for local development only, not production.
- **1.4 Validation**: `docker compose up` starts all services. All `/health` endpoints return 200. Keycloak admin accessible.

---

### Phase 2 — Core Service Implementation (Independent)
**Goal**: Each service completed, tested, and verified independently before integration.

#### 2.1 User Service
- JWT validation middleware
- Profile CRUD endpoints
- Role handling
- Input validation (strict schema)
- Structured JSON logging with correlation ID
- MongoDB Indexes: unique `email`, index `role`
- Tests: unit tests + integration tests (DB included)

#### 2.2 Feed Service
- Post creation endpoint
- Paginated feed retrieval
- MinIO image upload integration
- Redis cache integration (TTL on feed pages)
- MongoDB Indexes: `userId`, `createdAt`, compound `(userId, createdAt)`
- Tests: unit + integration

#### 2.3 Event/Job Service
- Create job/event
- Status tracking with transitions
- Retry with exponential backoff on failures
- Dead-letter queue simulation for unretryable events
- MongoDB Indexes: `status`, `deadline`

#### 2.4 Notification Service
- Async event consumer (not blocking request path)
- Retry handling (up to 3 attempts)
- Idempotency key enforcement to prevent duplicate notifications

---

### Phase 3 — Cross-Cutting System Features
**Goal**: Add production-grade cross-service features before Kubernetes deployment.

- **3.1 Centralized Logging**: Deploy Grafana Loki + Promtail. All services emit structured JSON logs with `{service, level, requestId, timestamp}`. Logs searchable by service, level, correlationId.
- **3.2 Metrics & Monitoring**: Deploy Prometheus and Grafana. All services expose `/metrics`. Dashboards for CPU, memory, request latency, error rate, pod restarts, DB response time.
- **3.3 Rate Limiting**: Configure NGINX Ingress with `nginx.ingress.kubernetes.io/limit-rps` annotations. Define req/sec per IP and burst limits.
- **3.4 Secrets Management**: Create Kubernetes `Secret` objects for all credentials. Remove any credentials from app code or ConfigMaps.
- **3.5 API Versioning**: Enforce `/api/v1/` globally. Document versioning strategy.

---

### Phase 4 — Kubernetes Deployment
**Goal**: Move from Docker Compose to production-grade Kubernetes.

- **4.1 Per-Service K8s Manifests**:
  - `Deployment` with replica count
  - `Service` (ClusterIP)
  - `ConfigMap` for env config
  - `Secret` for credentials
  - `HorizontalPodAutoscaler` (CPU/memory targets)
  - `livenessProbe` and `readinessProbe` on `/health` and `/ready`
  - Resource `requests` and `limits` (CPU and memory)

- **4.2 Stateful Components**:
  - MongoDB: `StatefulSet` + `PersistentVolumeClaim`
  - Redis: `Deployment` + PVC
  - MinIO: `StatefulSet` + PVC

- **4.3 TLS/HTTPS**:
  - Deploy `cert-manager`
  - Issue certificates via Let's Encrypt
  - Terminate TLS at Ingress
  
- **4.4 NGINX Ingress**:
  - Path-based routing: `/api/v1/users` → `user-service`, `/api/v1/feed` → `feed-service`, etc.
  - Rate limiting annotations enabled
  - TLS enabled

- **4.5 Namespaces**:
  - `dev`, `staging`, `production`, `monitoring`

- **4.6 Security Baseline**:
  - Kubernetes Network Policies
  - Non-root containers enforced via `securityContext`

---

### Phase 5 — Backup & Recovery
**Goal**: Implement data protection.

- **5.1 MongoDB Backup**: A Kubernetes `CronJob` runs daily, executes `mongodump`, tarballs the output, and pushes to MinIO.
- **5.2 Recovery Test**: Simulate DB deletion. Restore from latest MinIO backup. Measure elapsed time.
- **5.3 Documentation**: Document Recovery Time Objective (RTO) and Recovery Point Objective (RPO).

---

### Phase 6 — CI/CD & Infrastructure Automation
**Goal**: Automate build and deployment pipeline.

- **6.1 GitHub Actions Pipeline**:
  - Trigger: code push to `main` or PR
  - Stages: Lint → Unit Test → Integration Test → Docker Build → Push to Docker Hub → Deploy to staging → Smoke Test → Promote to production

- **6.2 Terraform (Infrastructure as Code)**:
  - Provision Kubernetes cluster
  - Load balancer
  - Storage volumes
  - Networking and DNS
  - Ensures repeatable, version-controlled infrastructure

---

### Phase 7 — Performance & Scalability Validation
**Goal**: Confirm the system handles realistic load.

- Run load tests simulating 100 → 500 concurrent users
- Monitor CPU, memory, and API latency under load
- Verify HPA triggers pod scale-out on threshold breach
- Confirm no crash loops or DB instability under load

---

### Phase 8 — Security Hardening
**Goal**: Harden the cluster against misuse and attacks.

- Enforce Kubernetes Network Policies between namespaces
- Enforce non-root containers via `securityContext.runAsNonRoot: true`
- Drop unnecessary Linux capabilities
- *(Optional)* Run image vulnerability scan with Trivy
- Simulate secret rotation and verify services recover without downtime

---

### Phase 9 — Final Integration & Stability
**Goal**: Controlled full-system integration and resilience validation.

- **9.1 Integration Order**: Auth → User → Feed → Cache → Event → Notification → Ingress (Never integrate all at once)
- **9.2 Staging Deployment**: Full test suite in staging namespace
- **9.3 Failure Simulation**: Kill pods, stop DB, simulate network delay
- **9.4 Resilience Validation**: Verify self-healing, pod restart, traffic rerouting

---

### Phase 10 — Documentation & Report Finalization
**Goal**: Produce complete academic and operational documentation.

- Architecture diagrams: SOA, Enterprise, K8s cluster view, data flow
- API documentation
- Logging architecture
- Backup and restore strategy
- Rate limiting design
- Indexing strategy
- Secrets management
- Testing strategy
- Scalability validation results

---

## ✅ Final Architecture Capabilities

| Capability | Status |
|---|---|
| SOA | ✔ |
| Kubernetes Orchestration | ✔ |
| Horizontal Scaling | ✔ |
| Load Balancing | ✔ |
| TLS Everywhere | ✔ |
| JWT Authentication | ✔ |
| RBAC | ✔ |
| Secrets Management | ✔ |
| API Versioning | ✔ |
| Centralized Logging | ✔ |
| Metrics & Monitoring | ✔ |
| Backup Strategy | ✔ |
| Database Indexing | ✔ |
| Caching | ✔ |
| Retry Logic | ✔ |
| CI/CD Pipeline | ✔ |
| Infrastructure as Code | ✔ |
| Testing Strategy | ✔ |
| Fault Tolerance | ✔ |
| Security Hardening | ✔ |
