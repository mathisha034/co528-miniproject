# Project Implementation Plan

This document outlines the technical plan for building a robust social and academic platform using a microservices architecture. It maps the 6-phase scope into a concrete software design.

## Architecture Overview

- **Architecture Style**: Microservices housed within a Monorepo.
- **API Gateway**: Nginx handling routing (e.g., `/api/users` -> `user-service`) and optionally participating in JWT validation.
- **Identity Provider**: Keycloak for Authentication and Role-Based Access Control (RBAC) (roles: `student`, `alumni`, `admin`).
- **Database**: MongoDB (capable of per-service logical databases).
- **Object Storage**: MinIO for image and document uploads.
- **Real-time Communication**: Socket.io for the messaging service.
- **Service Deployment**: Docker and Docker Compose.

## User Review Required

> [!IMPORTANT]
> Please review this plan and clarify your preferences on the following technology choices so we can start exactly as you want:
> 1. **Backend Framework**: What Node.js framework should the microservices use (e.g., Express, NestJS, Fastify)?
> 2. **Frontend Framework**: What should the `/web` client be built with (e.g., React/Next.js, Vue)?
> 3. **Monorepo Tooling**: Do you prefer a specific monorepo manager like Turborepo, Nx, or simply `npm workspaces` / `yarn workspaces`?

## Proposed Changes

### Phase 0: Infrastructure & Monorepo

- **Directory Setup**: Create `/services`, `/web`, `/mobile`, `/infra`, and `/docs` in the project root.
- **Docker Stack**: Setup `/infra/docker-compose.yml` encapsulating Keycloak, MongoDB, MinIO, Nginx, and optionally Redis. (Keycloak typically also requires a Postgres DB).
- **Keycloak Init**: Draft a setup script or configuration instructions for realm creation, roles `[student, alumni, admin]`, client registration, and JWT token issuing.

### Phase 1: Gateway & Users

- **Nginx Config (`/infra/nginx.conf`)**: Define proxy passes to internal service network endpoints.
- **User Service (`/services/user-service`)**: Connect to MongoDB. Create REST endpoints for syncing users from Keycloak, getting profiles, and updating profiles. Secure endpoints validating JWTs and roles.
- **Basic Web App (`/web`)**: Initialize the web project, integrate Keycloak login (e.g. `keycloak-js`), and test fetching a protected profile.

### Phase 2: Feed & Notifications

- **Feed Service (`/services/feed-service`)**: Create models for Posts, Comments, and Likes. Integrate with MinIO directly via server SDK or using presigned URLs for client-side uploads.
- **Notification Service (`/services/notification-service`)**: Independent service tracking system events (likes, comments). Initially REST-based updates to MongoDB.

### Phase 3: Academic/Career (Jobs & Events)

- **Job Service (`/services/job-service`)**: Implement job postings and application models. Add strict RBAC logic ensuring only `alumni` and `admin` roles can post.
- **Event Service (`/services/event-service`)**: Create event management and RSVP features.
- **Notifications**: Add cross-service hooks (via HTTP or basic Redis pub/sub) to alert users when a job is posted or application is sent.

### Phase 4: Real-time Messaging

- **Messaging Service (`/services/messaging-service`)**: Deploy a Node.js WebSocket server using Socket.io. Secure connection via JWT. Store message history in MongoDB.

### Phase 5: Research & Analytics

- **Research Service (`/services/research-service`)**: Handle collaborative projects and manage multiple MinIO document uploads.
- **Analytics Service (`/services/analytics-service`)**: Build an `admin` only endpoint orchestrating metrics compilation (using MongoDB aggregation pipelines to calculate active users, job stats, etc.).

### Phase 6: Production Ops

- **Hardening**: Add Nginx SSL setup, configure `.env` distinctions for production vs development, and verify container persistent volumes for Mongo and MinIO.

## Verification Plan

### Automated Tests
- Integration tests targeting the Nginx Gateway to ensure proper microservice routing.

### Manual Verification
- **Phase 0 Checklist**: Access Keycloak Admin panel, connect to MongoDB locally, upload to MinIO web console, and hit the Nginx gateway endpoint.
- **E2E Post Flow**: Auth -> Get Token -> Add Post -> Attach Img -> Feed populates correctly.
