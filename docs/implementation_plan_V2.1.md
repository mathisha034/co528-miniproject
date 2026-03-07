# Project Implementation Plan (v2.1)

This plan outlines the architecture for a 4-week, Kubernetes-native microservices backend for the social and academic platform. 

## Architectural Overview

- **Orchestration**: Kubernetes (Distributed cluster orchestration via Minikube / Kind / k3s).
- **Core Infrastructure**: Keycloak (Auth), MongoDB (Database), MinIO (Object Storage), Redis (Pub/Sub for Socket.io).
- **Routing**: NGINX Ingress Controller for routing, TLS, load balancing, and path-based routing.
- **Microservices**: Each service (user, feed, job, event, research, messaging, notification, analytics) is a `Deployment` with a corresponding `Service` (ClusterIP), `ConfigMap`, `Secret`, and health probes.
- **Monitoring (Optional)**: Prometheus and Grafana for cluster metrics.

## User Review Required

> [!IMPORTANT]
> Please review the updated Phase 7 additions and NGINX Ingress Controller clarifications in this v2.1 plan. Let me know if you are ready to proceed.

## Proposed Changes

### Phase 0: Kubernetes Environment Setup

- **Cluster Init**: Start a local cluster and verify `kubectl` is authenticated.
- **Core Deployments**: Deploy Kubernetes manifests (`Deployment`, `Service`, `PersistentVolumeClaim`) for MongoDB (single instance with PVC), MinIO (StatefulSet + PVC), Redis, and Keycloak (Deployment + Service + PVC for DB).

### Phase 1: User Service & Auth Integration

- **Containerization**: Create `Dockerfile` for the `user-service`. Push to DockerHub (or local registry).
- **K8s Manifests**: Generate manifests including `Deployment`, `Service`, `ConfigMap`, `Secret`, and health probes (e.g., `readinessProbe` on `/health`).
- **Ingress Setup**: Configure NGINX Ingress to route external traffic to Keycloak and the User Service. Verify JWT auth flow.

### Phase 2: Feed Service & MinIO Scaling

- **Feed Microservice**: Build and containerize `feed-service`.
- **Scaling Test**: Deploy with 2 initial replicas. Run a manual test scaling from 1 -> 3 replicas. Verify MongoDB connects correctly across all instances and horizontal scaling works.

### Phase 3: Core Academic Modules

- **Deployments**: Add manifests for `job-service` and `event-service`.
- **Integration Validation**: Add role-based protection, notification trigger events, and test the full E2E flow (Post job -> Apply -> RSVP event).

### Phase 4: Messaging & Redis Pub/Sub

- **Messaging Infrastructure**: Deploy `messaging-service` with 2 replicas backed by Redis for Socket.io state management.
- **Distributed Delivery**: Verify that a message sent across replicas works, proving distributed real-time communication.

### Phase 5: Advanced Features

- **Enterprise Services**: Deploy `research-service` and `analytics-service`.
- **Implementation**: Add aggregation queries and Admin-only REST access.

### Phase 6: Production Hardening

- **Resource Definitions**: Edit all Deployments to add resource requests and limits (e.g., CPU `100m` to `500m`).
- **HPA configuration**: Add `HorizontalPodAutoscaler` manifests.
- **Update Protocols**: Set `strategy: RollingUpdate` to ensure zero-downtime deployments. Deploy a new version and test for zero downtime.

### Phase 7: Documentation & Demo

- **Diagrams**: Prepare SOA, Enterprise, and Deployment (K8s cluster view) diagrams.
- **Architecture Documentation**: Document Product modularity, Scaling architecture, and High availability explanations.

## Integration Strategy (Golden Rules)

1. **API First**: Never start a new service without a defined API contract.
2. **Sequential Flow**: Finish one service fully before starting the next.
3. **Stable Environment**: Keep Docker/K8s environment stable.
4. **Environment Parity**: Use `ConfigMap` and `Secret` for *all* connections; hardcoded variables are barred.
5. **Immediate Testing**: Test integration immediately after deploying each service via `kubectl port-forward` or Ingress hitting.
