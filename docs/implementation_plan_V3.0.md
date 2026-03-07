# Project Implementation Plan (v3.0 - Robust Architecture)

This version enhances the Kubernetes architecture by adding observability, resilience, security hardening, data protection, and operational maturity.

## 🏗 High-Level Architecture

External Entry: `User → Internet → LoadBalancer → NGINX Ingress Controller → Services → Pods`

### Core Components inside K8s
1. **Authentication**: Keycloak (Deployment + Service + Persistent Volume)
2. **Microservices**: `user`, `feed`, `job`, `event`, `research`, `messaging`, `notification`, `analytics` (All deployed with Replicas, Services, ConfigMaps, Secrets, and Health Probes)
3. **Database**: MongoDB (Single Pod + PV for this project scale, capable of ReplicaSet config)
4. **Object Storage**: MinIO (StatefulSet + PV)
5. **Real-Time/Caching**: Redis (Socket.io Pub/Sub, API Caching)
6. **Observability**: Loki + Promtail (Logs) + Grafana (Dashboards)

## 🔴 Priority Additions Addressed

1. **Centralized Logging (Loki)**: Promtail collects logs from pods -> Loki -> Grafana (Phase 5).
2. **Backup & Recovery (Mongo -> MinIO)**: Daily CronJob to dump DB directly into MinIO (Phase 5).
3. **Database Indexing**: Explicit indexing defined in service initialization (Phase 2 & 3).
4. **Rate Limiting**: Configured at the NGINX Ingress level to protect APIs (Phase 1).
5. **Secrets Management**: K8s Secrets used strictly for passwords and credentials (Phase 0).
6. **API Versioning**: Enforced globally on endpoints, e.g., `/api/v1/` (Phase 1).
7. **Testing Strategy**: Unit tests per service, integration tests, E2E flow, and CI/CD via GitHub Actions (Continuous/Phase 6).

## 📆 Phase-Wise Implementation

### Phase 0: Infrastructure Foundation (Production-Ready)
- Setup local Kubernetes separated by basic namespaces (if necessary).
- Initialize Kubernetes **Secrets** for external credentials.
- Deploy Core Infrastructure: MongoDB (PV), MinIO (StatefulSet), Redis, Keycloak.

### Phase 1: Gateway + Auth + API Standards
- Configure NGINX Ingress with **Rate Limiting**.
- Stand up the `user-service`, enforcing **API Versioning**.
- Integrate Keycloak JWT validation.
- Implement Health Probes and initial **Unit Tests**.

### Phase 2: Feed + Indexing + Storage
- Deploy `feed-service` with connection to MinIO.
- Implement **MongoDB Indexing** on feed creation dates and user IDs to guarantee query performance.
- Add simple TTL **Caching** for feed queries via Redis.
- Add **Integration Tests**.

### Phase 3: Jobs & Events + Notification Logic
- Deploy `job-service` and `event-service`.
- Add DB **Indexing** for jobs and events.
- Implement notification trigger logic with an **Event Retry Mechanism** (exponential backoff on failures).

### Phase 4: Messaging + Redis + Caching
- Deploy `messaging-service` (2 Replicas) demonstrating true horizontal scale via **Redis Pub/Sub**.
- Implement message persistence retries.
- Implement caching for expensive analytics queries.

### Phase 5: Observability + Backup + Tracing
- Deploy lightweight **Logging Stack** (Loki + Promtail + Grafana).
- Implement the MongoDB **Backup CronJob** storing tarballs in MinIO. Document the restore process.
- *(Optional)* Set up distributed tracing (Jaeger/OpenTelemetry) if time permits.

### Phase 6: CI/CD + Testing Hardening
- Build **GitHub Actions** workflow for continuous testing, image building, and pushing.
- Formalize End-to-End integration tests.
- Formally setup the **Horizontal Pod Autoscaler (HPA)**, Resource Limits, and validate Rolling Updates.

### Phase 7: Documentation & Architecture Finalization
- Document the entire system mapping: Logging architecture, Backup strategy, Rate limiting design, Indexing strategy, Secrets management, Testing strategy, and Scalability.
- Provide final architecture diagram assets.

## Integration Strategy

- Prioritize **Secrets, Indexing, API Versioning, Rate Limiting, Logging, and Backups**.
- Distinguish between core requirements to implement, and advanced items (like Distributed Tracing) to document for architecture discussion.
- Apply Kubernetes Secrets dynamically; avoid hard-coding in app code.
