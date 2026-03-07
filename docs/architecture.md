# Social Media Microservices Platform - Architecture

This document maps out the logical and deployment architecture of the MiniProject Social Media platform. It runs on a Kubernetes cluster (Minikube in dev) using a containerized NestJS microservice architecture.

## High-Level System Architecture

```mermaid
graph TD
    %% Define External Entities
    Client[Web/Mobile Client] -->|API Calls| Nginx[NGINX Ingress Controller]

    %% Define Auth Layer
    subgraph Security Layer
        Nginx -->|Authentication/OIDC| Keycloak[Keycloak Identity Provider]
    end

    %% Define API Gateway / Services Layer
    subgraph Microservices Layer
        Nginx -->|Routes /api/v1/users| UserService[User Service]
        Nginx -->|Routes /api/v1/feed| FeedService[Feed Service]
        Nginx -->|Routes /api/v1/events| EventService[Event Service]
        Nginx -->|Routes /api/v1/notifications| NotificationService[Notification Service]
        Nginx -->|Routes /api/v1/jobs| JobService[Job Service]
        Nginx -->|Routes /api/v1/messaging| MessagingService[Messaging Service]
        Nginx -->|Routes /api/v1/research| ResearchService[Research Service]
        Nginx -->|Routes /api/v1/analytics| AnalyticsService[Analytics Service]
    end

    %% Define Databases and Persistence
    subgraph Persistence Layer
        UserService --> MongoDb[(MongoDB ReplicaSet)]
        FeedService --> MongoDb
        EventService --> MongoDb
        NotificationService --> MongoDb
        JobService --> MongoDb
        MessagingService --> MongoDb
        ResearchService --> MongoDb
        AnalyticsService --> MongoDb

        FeedService --> Redis[(Redis Cache)]
        UserService --> Redis
    end

    %% Define External Storage
    subgraph Object Storage
        FeedService --> MinIO[(MinIO / S3 Object Storage)]
    end

    %% Define Inter-Service Communication
    FeedService -.->|HTTP POST /notify| NotificationService
```

## Component Details

1. **NGINX Ingress Controller**: Handles TLS termination (via cert-manager), rate limiting, and path-based routing (`/api/v1/*`) directly to specific cluster IP services.
2. **Keycloak**: Handles User authentication, Identity provisioning, and JWT (JSON Web Token) creation using RS256/HS256 algorithms. Services validate JWTs locally via a synchronized JWKS public key or symmetric shared secret.
3. **NestJS Microservices**: Independent bounded contexts separated into distinct Kubernetes deployments and Node.js instances (User, Feed, Event, Notification, Job, Messaging, Research, Analytics).
4. **MongoDB ReplicaSet**: Centralized NoSQL document store mapped with Mongoose. Organized hierarchically (e.g. `users`, `posts`, `notifications` collections) to maintain relational sanity while supporting distinct bounded contexts.
5. **Redis Cache**: Offloads repetitive read queries, primarily caching Feed pagination `feed:page:*` to alleviate MongoDB spikes.
6. **MinIO**: S3-compatible object storage layer handling blob media files (user avatars, feed post images) triggered primarily by the Feed service.
