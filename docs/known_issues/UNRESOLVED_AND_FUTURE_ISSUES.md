# Unresolved and Future Issues

This document tracks all issues that are **NOT YET RESOLVED** or represent **architectural risks** that could cause problems in future development/deployment phases.

---

## 🔴 CRITICAL UNRESOLVED ISSUES

### Issue 37: Messaging Service — Bare App Scaffolding
**Status:** ❌ NOT RESOLVED  
**Priority:** 🔴 CRITICAL  
**Date Logged:** 2026-03-08

**Context:**
The Messaging Service exists as an empty NestJS boilerplate application. No domain logic, no core implementations, no business logic is present.

**What's Missing:**
- `src/messaging/` domain module completely empty
- No message create/retrieve/update/delete operations
- No message queue integration (RabbitMQ, Redis Pub/Sub)
- No WebSocket support for real-time notifications
- No database schema for messages, conversations, threads
- No authentication/authorization guards
- No inter-service communication endpoints

**Error Signature:**
- All messaging-related API calls return `404 Not Found`
- InfraStatus monitoring shows service as "up" but non-functional
- Any attempt to send messages between users silently fails

**System Impact:**
🔴 **CRITICAL** — The entire chat/messaging feature is nonexistent. Users cannot communicate via messages.

**Potential Breakage Points:**
1. Frontend `Messaging.tsx` page loads and renders empty (no conversations list)
2. Real-time message indicators on user profiles will never update
3. Notification delivery system has no mechanism for message notifications
4. No fallback to email when user is offline

**Future Implementation Required:**
- [ ] Create MongoDB schema for `Message`, `Conversation`, `Thread`
- [ ] Implement CRUD controllers for message operations
- [ ] Add WebSocket gateway for real-time message delivery
- [ ] Implement RabbitMQ consumer for async message processing
- [ ] Add authentication guards (JwtAuthGuard)
- [ ] Add optional TLS upgrades for sensitive message content
- [ ] Create health endpoint for monitoring

**Recommended Timeline:** Phase 9.3+

---

### Issue 38: Messaging Service — No Health Endpoint
**Status:** ❌ NOT RESOLVED  
**Priority:** 🔴 CRITICAL  
**Date Logged:** 2026-03-08

**Context:**
The Messaging Service lacks a `/health` endpoint required by the InfraStatus monitoring dashboard.

**Error Signature:**
- `GET /api/v1/messaging-service/health` → `404 Not Found`
- InfraStatus polling fails every 30 seconds (logged as timeout)
- No liveness/readiness probe for Kubernetes HPA scaling

**System Impact:**
🔴 **CRITICAL** — The service appears permanently offline on dashboards despite potentially running correctly (or not running at all, which also appears as offline).

**Kubernetes Implications:**
- HPA cannot determine if pod is healthy
- Service may be stuck in `CrashLoopBackOff` without detection
- Rolling deployments may fail silently
- Load balancer may route traffic to non-functional pods

**Future Implementation Required:**
- [ ] Add `@Controller('health')` or `@Controller()` with `@Get('health')` route
- [ ] Implement liveness probe returning `{ status: 'ok' }`
- [ ] Implement readiness probe checking database/queue connectivity
- [ ] Add Kubernetes probes in deployment YAML:
  ```yaml
  livenessProbe:
    httpGet:
      path: /health
      port: 3000
    initialDelaySeconds: 10
    periodSeconds: 10
  readinessProbe:
    httpGet:
      path: /health/ready
      port: 3000
    initialDelaySeconds: 5
    periodSeconds: 5
  ```

**Recommended Timeline:** Phase 9.2 (before Messaging MVP)

---

## 🟡 MEDIUM-PRIORITY UNRESOLVED ISSUES

### Issue 15: Analytics Service HPA CPU Threshold Inconsistency
**Status:** ⏳ PENDING  
**Priority:** 🟡 MEDIUM  
**Date Logged:** 2026-03-08

**Context:**
The Kubernetes HorizontalPodAutoscaler (HPA) for `analytics-service` is configured with a different CPU threshold than all other microservices.

**The Mismatch:**
- All 7 other microservices: `averageUtilization: 30%`
- Analytics service: `averageUtilization: 70%`

**Error Signature:**
- Analytics service scales much later than peers under identical load
- Under traffic spikes, analytics queries slow down while other services quickly scale out
- Dashboard analytics queries may timeout while feed/event queries respond normally

**System Impact:**
🟡 **MEDIUM** — Inconsistent scaling behavior; potential SLA violation for analytics dashboard under high load.

**Root Cause:**
Likely a copy-paste error or legacy value from earlier HPA configuration. The 70% threshold was never updated to match the standardized 30% across all services.

**Fix Required (Simple):**
```yaml
# File: k8s/services/analytics-service/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: analytics-service-hpa
  namespace: miniproject
spec:
  targetCPUUtilizationPercentage: 30  # ← Change from 70 to 30
```

**Recommended Timeline:** Phase 9.2 (hotfix)

---

### Issue 13: Messaging Service Has No Health Endpoint
**(See Issue 38 above — same issue documented twice)**

---

## 🟢 LOW-PRIORITY INTEGRATION GAPS

### Gap 1: Shared UI Component Library Not Integrated
**Status:** ⏳ SCAFFOLDED but NOT INTEGRATED  
**Priority:** 🟢 LOW  
**Date Logged:** 2026-03-08

**Context:**
The `web/src/components/ui/` library was created with three production-ready components:
- `Button.tsx` (with variants: primary, secondary, outline, ghost, danger)
- `Card.tsx` (container component)
- `Badge.tsx` (status badges with color variants)

However, **no page imports from this library**. All pages continue to use inline JSX for UI elements.

**Current State:**
```typescript
// ❌ What pages currently do (inline JSX):
export function Dashboard() {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200">
      <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
        Click me
      </button>
    </div>
  );
}

// ✅ What they should do (shared components):
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function Dashboard() {
  return (
    <Card>
      <Button variant="primary">Click me</Button>
    </Card>
  );
}
```

**System Impact:**
🟢 **LOW** — Code duplication and inconsistency, but functionality is preserved.

**Maintenance Burden:**
- UI style changes require updates in multiple places
- Inconsistent button sizes/colors across pages
- Future theme changes difficult to propagate

**Future Refactoring Needed:**
- [ ] Audit all pages for duplicate inline UI elements
- [ ] Create migration guide for component adoption
- [ ] Update 8 pages to use shared components:
  - [ ] Dashboard.tsx
  - [ ] Feed.tsx
  - [ ] Research.tsx
  - [ ] Analytics.tsx
  - [ ] Jobs.tsx
  - [ ] Events.tsx
  - [ ] Profile.tsx
  - [ ] InfraStatus.tsx

**Recommended Timeline:** Phase 9.3+ (refactoring, non-blocking)

---

### Gap 2: `useFetch` Hook Defined But Not Used
**Status:** ⏳ IMPLEMENTED but NOT DEPLOYED  
**Priority:** 🟢 LOW  
**Date Logged:** 2026-03-08

**Context:**
A custom `useFetch` hook was created in `web/src/hooks/useFetch.ts` providing:
```typescript
export function useFetch<T>(url: string, options?: AxiosRequestConfig): UseFetchResult<T>
// Returns: { data, loading, error, refetch }
```

However, **all pages still use inline axios calls** instead of this hook.

**Current State:**
```typescript
// ❌ What pages currently do (inline axios):
const [posts, setPosts] = useState([]);
useEffect(() => {
  axios.get('/api/v1/feed-service/feed').then(res => setPosts(res.data.items));
}, []);

// ✅ What they should do (shared hook):
const { data: feed } = useFetch('/api/v1/feed-service/feed');
const posts = feed?.items || [];
```

**System Impact:**
🟢 **LOW** — Duplication of data-fetching logic, but functionality is preserved.

**Maintenance Burden:**
- Error handling inconsistent across pages
- Loading state management duplicated
- No centralized data-fetching middleware opportunity
- Difficult to add global interceptors or retry logic

**Future Integration Required:**
- [ ] Update all 8 pages to use `useFetch` hook
- [ ] Remove inline axios calls from page components
- [ ] Consolidate error handling logic

**Hook Already Supports:**
✅ Generic type inference  
✅ Automatic loading/error states  
✅ Manual refetch trigger  
✅ Axios config pass-through  

**Recommended Timeline:** Phase 9.3+ (refactoring, non-blocking)

---

### Gap 3: `useAuth` Hook Duplication
**Status:** ⏳ PARTIALLY RESOLVED  
**Priority:** 🟢 LOW  
**Date Logged:** 2026-03-08

**Context:**
Two different `useAuth()` hooks exist in the codebase:

**Location 1: `web/src/contexts/AuthContext.tsx`**
```typescript
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

**Location 2: `web/src/hooks/useAuth.ts`**
```typescript
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
```

Both are functionally identical. Pages import from either location without issue.

**System Impact:**
🟢 **LOW** — Duplication, but both implementations are identical.

**Future Cleanup:**
- [ ] Choose single source of truth (recommend `hooks/useAuth.ts`)
- [ ] Update AuthContext.tsx to export from hooks instead
- [ ] Update all imports to use single location

**Recommended Timeline:** Phase 9.3+ (code cleanup)

---

## ⚠️ ARCHITECTURAL RISKS & POTENTIAL FUTURE ISSUES

### Risk 1: JWT Public Key Rotation Not Automated
**Risk Level:** ⚠️ HIGH  
**Impact:** Auth system failure during key rotation

**Current State:**
- Keycloak realm keys are manually rotated only when realm is recreated (Issue 45)
- No scheduled key rotation exists
- No automated secret rotation pipeline

**Potential Breakage:**
If Keycloak realm rotates keys (e.g., during security audit or key compromise):
1. Old JWT tokens become invalid (signature mismatch)
2. All authenticated users are logged out
3. `jwt-secret` Kubernetes secret must be manually updated
4. All 8 services must restart to pick up new key
5. Until restart completes, services return 401 InvalidSignature

**Prevention:** 
- [ ] Create CI/CD job that detects key rotation and auto-updates secret
- [ ] Implement cache invalidation for JWT validation (currently cached by pod restart)
- [ ] Document manual rotation procedure for emergency scenarios

**Recommended Implementation:** Phase 9.3

---

### Risk 2: No Distributed Tracing Across Services
**Risk Level:** ⚠️ MEDIUM  
**Impact:** Debugging cross-service failures is extremely difficult

**Current State:**
- Each service logs independently to stdout
- No correlation IDs between service calls
- No request trace visualization (e.g., Jaeger, Zipkin)
- Feed service calls notification service internally with `x-internal-token` but no trace ID

**Potential Breakage:**
Example failure scenario:
```
User: "Feature X is broken"
Timeline of events:
  1. User clicks "Create Post" on Feed page
  2. POST /feed-service/feed → 201 Created
  3. Feed service internally calls notification-service
  4. Notification service call fails silently
  5. User never receives "post created" notification

Root cause finding:
  Without trace IDs, you must:
  1. Check feed-service logs for notification call attempt
  2. Find the timestamp of the call
  3. Cross-check notification-service logs at that timestamp
  4. Hope logs haven't rotated
  5. Hope you identified the right request (high concurrency makes this hard)
```

**With distributed tracing:**
```
GET /tracing/trace-id-12345
{
  "Feed.createPost": { status: "success", duration: 42ms },
    └─> "Notification.notify": { status: "500_timeout", duration: 5000ms, error: "..." }
}
```

**Prevention:**
- [ ] Implement correlation ID propagation (X-Request-ID header)
- [ ] Integrate OpenTelemetry + Jaeger/Zipkin
- [ ] Update `InterceptorContext` to include trace ID middleware
- [ ] Document tracing in development guide

**Recommended Implementation:** Phase 9.4

---

### Risk 3: No Redis Pub/Sub for Real-Time Features
**Risk Level:** ⚠️ MEDIUM  
**Impact:** Real-time features scale poorly; notification delivery unreliable

**Current State:**
- Redis exists in cluster but only used for Feed service caching
- No Pub/Sub implementation for real-time updates
- Notification topbar polls every 30 seconds (not real-time)
- WebSocket gateway missing (no server-to-client push)

**Potential Breakage:**
1. Feed page shows stale posts for other users until manual refresh
2. Notifications appear with 30-second delay
3. Collaboration features (research projects) show stale collaborator status
4. Job application counts don't update in real-time for job owners
5. Analytics "live" stats are not actually live (batch updates only)

**What could go wrong:**
- Redis connection pool exhaustion under high concurrency
- Message loss if pod crashes between publish and consume
- Duplicate notifications if message consumed twice
- No ordering guarantees for time-sensitive events

**Prevention:**
- [ ] Implement Redis Pub/Sub adapter in notification-service
- [ ] Add WebSocket gateway to provide real-time API
- [ ] Update frontend to use Socket.io or native WebSocket
- [ ] Document event channels and subscription patterns

**Recommended Implementation:** Phase 9.4

---

### Risk 4: No Rate Limiting on Public Endpoints
**Risk Level:** ⚠️ MEDIUM  
**Impact:** DoS vulnerability; resource exhaustion

**Current State:**
- No rate limiter middleware on any endpoint
- Auth endpoints have no brute-force protection
- Feed/analytics queries can be hammered without throttling
- File upload endpoints accept unlimited concurrent requests

**Potential Breakage:**
```
Attacker script:
for i in 1..10000:
  POST /api/v1/user-service/auth/login { wrong_credentials }
  
Result:
- CPU exhausted checking credentials
- Database connection pool full
- All legitimate users unable to login
- Other services affected by resource contention
```

**Prevention:**
- [ ] Implement rate limiting middleware (express-rate-limit or similar)
- [ ] Add exponential backoff on failed login attempts
- [ ] Limit file upload size and concurrent uploads
- [ ] Add DDoS protection at ingress level (nginx rate limit module)
- [ ] Monitor for unusual request patterns

**Recommended Implementation:** Phase 9.3

---

### Risk 5: No Backup/Restore Testing in CI/CD
**Risk Level:** ⚠️ HIGH  
**Impact:** Backup system may be broken until disaster strikes

**Current State:**
- Backup CronJob exists and runs every 6 hours
- MinIO S3 bucket receives backup data
- No automated test of restore procedure
- No validation that backup data is recoverable
- Manual restore documented but untested in automation

**Potential Breakage:**
Disaster scenario:
```
Timeline:
  Mon: MongoDB pod crashes, data corrupted
  Tue: Team discovers data loss
  Tue afternoon: Run restore from last backup
  Wed: Restore fails — backup was incomplete or corrupted
  Backup was "working" for 3+ days but never actually usable
```

**Prevention:**
- [ ] Add backup integrity check CronJob (verify backup tar, test extract)
- [ ] Add restore test job (weekly: restore to test namespace, verify schema)
- [ ] Implement backup versioning (keep last 7 days)
- [ ] Monitor backup job completion and failure rates
- [ ] Create runbook with RTO/RPO targets

**Recommended Implementation:** Phase 9.3

---

### Risk 6: No Data Encryption at Rest
**Risk Level:** ⚠️ MEDIUM  
**Impact:** Sensitive user data exposed if storage compromised

**Current State:**
- MongoDB stores documents in plaintext
- MinIO object storage unencrypted
- No field-level encryption (PII not protected)
- Redis cache stores JWTs unencrypted

**Potential Breakage:**
If Minikube VM is cloned or storage snapshot taken:
- All user profiles, research content, and messages are readable
- JWTs in Redis cache can be replayed
- MongoDB backups are unencrypted (visible in MinIO)

**Prevention:**
- [ ] Enable MongoDB encryption at rest (`security.enableEncryption: true`)
- [ ] Enable MinIO S3 bucket encryption
- [ ] Implement field-level encryption for PII (user emails, bio, etc.)
- [ ] Add encryption key management (rotate keys every 90 days)
- [ ] Document compliance implications (GDPR, FERPA if applicable)

**Recommended Implementation:** Phase 9.4

---

### Risk 7: No Observability for Performance Issues
**Risk Level:** ⚠️ MEDIUM  
**Impact:** Performance regressions go undetected until users complain

**Current State:**
- Prometheus metrics exist for HTTP request latency
- No end-to-end transaction timing (user action → API response)
- No slow query detection in MongoDB
- No cache hit/miss ratios tracked
- No memory leak detection

**Potential Breakage:**
Example regression:
```
Week 1: Feature X works, responds in 100ms
Week 2: New dependency added, now responds in 5s
Week 3: User complaint received
Week 4: Debugging reveals n+1 query problem

Better detection:
- Dashboard shows latency spike on Week 2
- Alert fires: "Feed service p95 latency > 1s"
- Team investigates immediately
```

**Prevention:**
- [ ] Add distributed APM (Datadog, New Relic, or open-source Prometheus)
- [ ] Implement transaction timer context
- [ ] Track database query performance
- [ ] Monitor Redis operation latencies
- [ ] Create SLA dashboard with target latencies

**Recommended Implementation:** Phase 9.4

---

### Risk 8: Pod Restart on SIGTERM Might Lose In-Flight Requests
**Risk Level:** ⚠️ LOW-MEDIUM  
**Impact:** User data loss during deployments or shutdowns

**Current State:**
- NestJS services shut down immediately on SIGTERM
- No graceful shutdown period to complete in-flight requests
- User file uploads could be interrupted mid-stream
- Notification creation could be lost

**Potential Breakage:**
During rolling deployment:
```
Timeline:
  1. Kubernetes sends SIGTERM to pod
  2. Service receives signal, closes server
  3. User's file upload mid-transfer (95% complete)
  4. Connection drops, upload lost
  5. User must restart upload
  
With graceful shutdown:
  1. Service receives SIGTERM
  2. Stops accepting new requests
  3. Waits up to 30s for in-flight requests to complete
  4. User's upload completes normally
  5. Pod terminates gracefully
```

**Prevention:**
- [ ] Implement graceful shutdown handler in `main.ts`
- [ ] Set pod `terminationGracePeriodSeconds: 30`
- [ ] Add health check that returns 503 after SIGTERM
- [ ] Drain connection pool and pending operations
- [ ] Log shutdown events for monitoring

**Recommended Implementation:** Phase 9.3

---

## 📋 RISK SUMMARY TABLE

| Risk | Priority | Impact | Effort | Timeline |
|------|----------|--------|--------|----------|
| Messaging Service not implemented | 🔴 CRITICAL | Users can't chat | 40h | Phase 9.3+ |
| Messaging Service no health endpoint | 🔴 CRITICAL | Monitoring broken | 2h | Phase 9.2 |
| Analytics HPA threshold mismatch | 🟡 MEDIUM | Scaling inconsistent | 0.5h | Phase 9.2 |
| JWT key rotation not automated | ⚠️ HIGH | Auth failure on rotation | 8h | Phase 9.3 |
| No distributed tracing | ⚠️ MEDIUM | Hard to debug failures | 16h | Phase 9.4 |
| No Redis Pub/Sub | ⚠️ MEDIUM | Real-time features broken | 20h | Phase 9.4 |
| No rate limiting | ⚠️ MEDIUM | DoS vulnerability | 6h | Phase 9.3 |
| Backup/restore untested | ⚠️ HIGH | Recovery fails at disaster | 12h | Phase 9.3 |
| No encryption at rest | ⚠️ MEDIUM | Data exposed if stolen | 12h | Phase 9.4 |
| No performance observability | ⚠️ MEDIUM | Regressions undetected | 16h | Phase 9.4 |
| Pod graceful shutdown missing | ⚠️ LOW-MEDIUM | Data loss on deploy | 4h | Phase 9.3 |
| UI component library unused | 🟢 LOW | Code duplication | 8h | Phase 9.3+ |
| `useFetch` hook unused | 🟢 LOW | Duplicated logic | 6h | Phase 9.3+ |

---

## Recommended Action Plan

### Phase 9.2 (Immediate — Next 1 week)
1. ✅ Fix Analytics HPA CPU threshold (0.5h)
2. ✅ Add Messaging Service health endpoint (2h)
3. ✅ Implement graceful shutdown (4h)

### Phase 9.3 (High Priority — Next 2-3 weeks)
1. Implement Messaging Service MVP (40h)
2. Add rate limiting middleware (6h)
3. Test backup/restore procedure and automate (12h)
4. Refactor pages to use UI component library (8h)

### Phase 9.4 (Medium Priority — Next month)
1. Implement distributed tracing (16h)
2. Add Redis Pub/Sub for real-time features (20h)
3. Implement data encryption at rest (12h)
4. Add performance observability / APM (16h)

---

## How to Track Progress

Each issue above should have an entry in the backlog or project board:
- [ ] Create GitHub issues for each unresolved item
- [ ] Label by priority: `critical`, `medium`, `low`
- [ ] Assign effort estimate (in hours)
- [ ] Link to this document for context

Track via:
```bash
# View all unresolved issues from CLI:
grep -n "Status.*NOT RESOLVED\|Status.*PENDING" docs/known_issues/UNRESOLVED_AND_FUTURE_ISSUES.md
```
