# Data Flow Diagrams

## 1. Authentication Flow
```
Client App
   │
   │ (1) GET /api/v1/... (no token)
   ▼
NGINX Ingress ──────────────────────────► 401 Unauthorized
   │
   │ (2) Redirect to Keycloak login
   ▼
Keycloak (/realms/miniproject)
   │
   │ (3) User submits credentials
   │ (4) Keycloak validates → issues JWT (access + refresh)
   ▼
Client App
   │
   │ (5) Stores JWT in memory / secure storage
   │ (6) Future requests: Authorization: Bearer <JWT>
   ▼
NGINX Ingress
   │
   │ (7) Forwards request with JWT to target service
   ▼
Microservice
   │
   │ (8) Validates JWT signature with Keycloak public key
   │ (9) Extracts role from JWT claims
   │ (10) Role guard allows / denies
   ▼
Response to Client
```

---

## 2. Feed Request Flow (with Cache)
```
Client App
   │ GET /api/v1/feed?page=1
   ▼
NGINX Ingress (TLS termination, rate limit check)
   │
   ▼
feed-service (Pod Replica A or B — load balanced by K8s)
   │
   │ Check Redis: key "feed:page:1"
   │
   ├─[CACHE HIT]──────────────────────────► Return cached response (< 100ms)
   │
   └─[CACHE MISS]
       │
       ▼
     MongoDB (posts collection)
       │ Query with indexes: createdAt DESC, limit 10
       ▼
     feed-service
       │ Store result in Redis (TTL: 60s)
       ▼
     Response to Client
```

---

## 3. Post Creation Flow
```
Client App
   │ POST /api/v1/feed  { content, hasImage: true }
   ▼
NGINX Ingress
   ▼
feed-service
   │ (1) Validate JWT, extract userId
   │ (2) Validate request body
   │ (3) If image attached:
   │       → Generate MinIO presigned upload URL
   │       → Return presigned URL to client
   │ (4) Client uploads image directly to MinIO
   │ (5) Client confirms upload with imageUrl
   │ (6) feed-service saves Post document to MongoDB
   │ (7) Invalidate Redis cache (feed:page:1)
   │ (8) HTTP call → notification-service (async)
   ▼
Response: 201 Created { postId, imageUrl }
```

---

## 4. Real-Time Messaging Flow
```
User A (Client)                          User B (Client)
   │                                          │
   │ (1) WebSocket connect to /ws              │
   ▼                                          │
messaging-service Pod A                       │
   │ (2) Authenticate via JWT                 │
   │                                          │
   │ (3) User A sends message                 │
   ▼                                          │
messaging-service Pod A                       │
   │ (4) Save message to MongoDB              │
   │ (5) Publish to Redis channel:            │
   │     "conversation:<conversationId>"      │
   │                                          │
   ▼                                          │
  Redis Pub/Sub ──────────────────────────────┤
                                              │
                                   messaging-service Pod B
                                              │
                                   (6) Subscribed to same channel
                                   (7) Delivers message to User B
                                              ▼
                                         User B receives message in real time
```

---

## 5. Job Application Flow
```
Student (Client)                         Alumni (Client)
   │                                          │
   │ POST /api/v1/jobs/:id/apply              │
   ▼                                          │
job-service                                   │
   │ (1) Validate JWT, role=student           │
   │ (2) Check job exists & status=open       │
   │ (3) Save Application document            │
   │ (4) HTTP call → notification-service     │
   │     (type: application_received,         │
   │      notify: job.postedBy)               │
   ▼                                          │
notification-service                          │
   │ (5) Save Notification to MongoDB         │
   │                                          ▼
   │                                    Alumni next login →
   │                                    GET /api/v1/notifications
   │                                    → receives application_received notification
   ▼
Response: 201 Created { applicationId }
```

---

## 6. Observability Flow
```
All Microservice Pods
   │
   │ Emit structured JSON logs to stdout
   ▼
Promtail (DaemonSet — runs on every node)
   │ Scrapes pod logs
   ▼
Grafana Loki
   │ Stores + indexes logs
   ▼
Grafana Dashboard
   │ Query: {service="feed-service"} |= "ERROR"

All Microservice Pods
   │ Expose GET /metrics (Prometheus format)
   ▼
Prometheus (scrapes every 15s)
   ▼
Grafana Dashboard
   │ Panels: CPU, memory, request rate, error rate, latency
```

---

## 7. Backup Flow
```
Kubernetes CronJob (daily 02:00 UTC)
   │
   ▼
mongodump --host mongodb --out /tmp/backup
   │
   ▼
tar -czf backup-YYYY-MM-DD.tar.gz /tmp/backup
   │
   ▼
mc cp backup-YYYY-MM-DD.tar.gz minio/backups/
   │
   ▼
MinIO bucket: backups/
   (7-day retention, oldest deleted by lifecycle policy)
```
