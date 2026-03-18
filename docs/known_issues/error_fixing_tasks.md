# Error Fixing Checklist

This document tracks the resolution progress of the pending known issues logged in `errors_log.md`.

## Web App (Frontend)
- [x] Issue 6: Web App -> Feed Service: Wrong URL path (`/api/v1/feed-service/posts` -> `/api/v1/feed-service/feed`)
- [x] Issue 8: Web App -> Analytics Service: Wrong URL path (`/api/v1/analytics-service/overview` -> `/api/v1/analytics-service/analytics/overview`)
- [x] Issue 9: Web App -> Research Service: Wrong URL path (`/api/v1/research-service/projects` -> `/api/v1/research-service/research`)
- [x] Issue 11: Empty UI Components Directory (Scaffold and implement shared UI component library)
- [x] Issue 12: Empty Hooks Directory (Implement shared custom hooks)

## Infrastructure / CI/CD
- [x] Issue 3: NestJS Services Rejecting Valid JWTs (401 Unauthorized) — Updated `k8s/secrets/jwt-secret.yaml` to include `KEYCLOAK_PUBLIC_KEY`; restarted all pods. ✅ **Tested & Verified 2026-03-08** (`test_issue3.js` — 200 OK on `/users/me`, 201 on POST `/feed`, no 401)
- [x] Issue 14: CI/CD uses `npm ci` but `package-lock.json` is missing (Change `npm ci` to `npm install`)
- [x] Issue 15: Analytics Service HPA CPU threshold inconsistency (Match 30% baseline)
- [x] Issue 43: Kubernetes deployment image tag drift — Documented procedure: build inside `eval $(minikube docker-env)`, tag with explicit version, patch via `kubectl set image`, update YAML manifest. `k8s/services/feed-service/deployment.yaml` updated to `v8`.
- [x] Issue 44: Keycloak login failure (`Cookie not found...`) under HTTP auth ingress — Migrated ingress to HTTPS-first with TLS (`miniproject-tls-secret`) and forced SSL redirects on `k8s/auth-ingress.yaml`, `k8s/ingress.yaml`, and `k8s/minio-ingress.yaml`. ✅ **Tested & Verified 2026-03-18** (HTTP `/auth` returns 308 to HTTPS, HTTPS OIDC metadata returns 200, HTTPS auth endpoint issues session cookies)
- [x] Issue 45: Multi-layer outage recovery (minikube stopped, Keycloak realm missing, stale jwt-secret key, backup image pull failure, persona setup script path mismatch) — Restored cluster, reprovisioned Keycloak, rotated JWT key secret, patched `tests/e2e/setup_personas.sh` for `/auth`, restarted all deployments, rebuilt backup image, and revalidated protected APIs + frontend proxy paths. ✅ **Tested & Verified 2026-03-18**

## User Service
- [x] Issue 4: Missing User Profile in MongoDB — 404 on `GET /me` for new Keycloak users (Fully resolved — JWT strategy fallback chain + `$or` upsert filter + clean `getMe()` auto-provisioning; see Issue 16 for technical detail)
- [x] Issue 16: `upsertFromKeycloak()` is never called — **Fully resolved** via four coordinated fixes:
  - `jwt.strategy.ts`: Added Keycloak claim fallback chain (`given_name`/`family_name`/`preferred_username`) so `req.user.email` and `req.user.name` are never `undefined`
  - `users.service.ts`: Changed upsert filter to `$or: [{ keycloakId }, { email }]` to handle user re-creation scenarios without hitting the unique email index
  - `users.controller.ts`: Wired `findMe()` → null check → `upsertFromKeycloak()` cleanly; removed stale debug logs
  - `setup_temp_users.sh`: Added MongoDB purge to `cleanup()` so stale documents do not survive test teardown
  - ✅ Verified by `test_issue16_4.js` passing end-to-end
- [x] Issue 17: `findById(id)` raw string mapping error (Add ObjectId validation before query)

## Feed Service
- [x] Issue 5: UUID BSON Casting Crash — `post.schema.ts` and `notification.schema.ts` refactored to `String` types; `getFeed()` returns `{ items, meta }` envelope; `likePost()` uses internal notification path. ✅ **Tested & Verified 2026-03-08** (`test_issue5.js` — UUID stored and queried without BSONError across feed-service and notification-service)
- [x] Issue 7 / 19: Response format mismatch (Wrap the array response in `{ items, meta }` envelope)
- [x] Issue 18: Web App integration URL mismatch (Fix controller path or frontend call)
- [x] Issue 20: Missing query filter support in `getFeed()` (Inject role filter into MongoDB query)
- [x] Issue 21: `MulterModule` Default Implicit Storage (Explicitly configure Multer memory storage)

## Job Service
- [x] Issue 22: No Duplicate-Application Guard (Create unique compound index in `JobApplication` schema)
- [x] Issue 23: `withRetry()` Deterministic Delay (Ensure it only responds to transient/timeout errors)

## Event Service
- [x] Issue 24: Missing `GET /:id` Endpoint (Add `@Get(':id')` binding to `findById()`)
- [x] Issue 25: Mongoose `findById()` CastError String (Validate ObjectId string format)
- [x] Issue 26: Race Condition Typing on `rsvp()` (Add strict null check directly after `findByIdAndUpdate()`)

## Notification Service
- [x] Issue 28: Silent Null on `markRead` (Throw exception if target payload is null)
- [x] Issue 29: Inter-Service Authenticative Tokens (Construct separate API gateways or secure inner cluster invocations)

## Research Service
- [ ] Issue 30: Missing Validation Constraints (Inject `class-validator` attributes onto Input models & add global pipe)
- [ ] Issue 31: `uploadDocument()` Undefined Attachment (Explicit null assertions for file structures)
- [ ] Issue 32: Upload Operation Atomicity (Establish compensating routines upon failed MongoDB save)
- [ ] Issue 33: Blind Collaborator Appendings (Verify target User ID exists in Keycloak/User schema)

## Analytics Service
- [x] Issue 34: Hardcoded Target Collection Flaw (Fix collection names correctly in stats query)
- [x] Issue 35: Unverified Payload Attributes (Wire up `ValidationPipe()`)
- [x] Issue 36: Tightly Coupled TSD PromQL Formatting (Use `*` or RegEx targets for prometheus query)

## Sub-Issues from Issue 16 & 4 Investigation
- [x] Issue 39: JWT strategy reads `payload.name`/`payload.email` which are undefined in Keycloak JWTs — Fixed with full fallback claim chain in `jwt.strategy.ts`
- [x] Issue 40: `minikube image load` silently ignores same-tag cached images — Resolved procedurally: always build directly inside Minikube's Docker daemon via `eval $(minikube docker-env) && docker build`
- [x] Issue 41: `test_issue16_4.js` assertions used wrong field names (`displayName`→`name`, `roles`→`role`, `_id`→`keycloakId`) — Fixed in test file
- [x] Issue 42: `setup_temp_users.sh` cleanup did not purge MongoDB documents — Fixed by adding `mongosh deleteMany()` call within `cleanup()`
