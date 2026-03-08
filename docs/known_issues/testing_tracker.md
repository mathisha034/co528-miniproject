# Error Verification Tracker

This document systematically tracks the testing of each logged error to ensure that the implemented fixes genuinely resolve the issues without introducing regressions. We will test one error at a time.

## 🧪 Completed Test

### Issue 1: Frontend API Route Mismatch (General Web App URL Sweep)
- **Status:** ✅ Passed
- **Description:** Initial sweep to ensure all frontend Axios call paths matched their backend `@Controller` paths through the Ingress rewrite rules. Multiple pages corrected.
- **Results:**
  - Audited `web/src/*` files; Axios paths were refactored to align directly with mapped `controller` routes defined in the backend codebase (e.g. `/api/v1/feed-service/feed`).
  - Synthesized non-mocked E2E integration test users (`temp_student`, `temp_admin`) within the Keycloak Master identity provider.
  - Successfully retrieved 200 OK from `feed-service` array, `job-service` output, and `event-service` arrays using the transient Student token.
  - Successfully retrieved 200 OK from the protected `analytics-service` using the transient Admin token.
  - Test accounts automatically wiped post-flight.

## 🧪 Completed Test

### Issue 9: Web App → Research Service: Wrong URL Path
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue9.js` + `setup_temp_users.sh`
- **Description:** Web app was calling `/api/v1/research-service/projects`. After ingress rewrite this became `/api/v1/projects` — no controller registered there. Fix routes to `/api/v1/research-service/research` → maps to `@Controller('research')`. Additionally discovered a multipart field name mismatch in document uploads (`document` vs `file`).

#### Implementation Audit (Pre-Test)
| File | Call Site | Path Used | Status |
|---|---|---|---|
| `Research.tsx:45` | `api.get(...)` — list projects | `/api/v1/research-service/research` | ✅ Correct |
| `Research.tsx:59` | `api.post(...)` — create project | `/api/v1/research-service/research` | ✅ Correct |
| `Research.tsx:72` | `api.post(...)` — invite collaborator | `/api/v1/research-service/research/:id/invite` | ✅ Correct |
| `Research.tsx:89` | `api.post(...)` — upload document | `/api/v1/research-service/research/:id/documents` | ✅ URL correct, field name ❌ |

#### Routing Chain
| Frontend Request | After Ingress Rewrite | Backend Matches |
|---|---|---|
| `/api/v1/research-service/research` | `/api/v1/research` | `@Controller('research')` + `@Get()` ✅ |
| `/api/v1/research-service/projects` (old) | `/api/v1/projects` | No controller → 404 ✅ |

#### Bug Found During Testing: Multipart Field Name Mismatch
- **Frontend** (`Research.tsx:92`): `formData.append('document', file)` ❌
- **Backend** (`research.controller.ts`): `FileInterceptor('file')` — expects field named `file`
- **Effect**: `req.file` is always `undefined` → `400 Bad Request: "A file attachment is required"` on every upload
- **Fix applied**: Changed to `formData.append('file', file)` in `Research.tsx`

#### Test Results
```
════════════════════════════════════════════════════════════
  Issue 9 — Research Service: URL Path & CRUD E2E
════════════════════════════════════════════════════════════

Student sub : 235e1ace-7af2-457a-b497-ae2398a6fac2

── Test A: GET /research-service/research  (correct URL → 200)
  ✅ PASS — 200 OK — @Controller('research') matched, returned array of 17 projects

── Test B: GET /research-service/projects  (old wrong URL → 404)
  ✅ PASS — 404 — bare /projects path is correctly unregistered (original bug confirmed fixed)

── Test C: POST /research-service/research  (create project → 201)
  ✅ PASS — 201 Created — _id=69ad5a1c..., title="E2E Test Project", ownerId=UUID

── Test D: GET /research-service/research/:id  (get by ID → 200)
  ✅ PASS — 200 OK — project returned, title="E2E Test Project"

── Test E: PATCH /research-service/research/:id  (update → 200)
  ✅ PASS — 200 OK — description updated successfully

── Test F: POST /:id/documents  field="document" (frontend bug → 400)
  ✅ PASS — 400 BadRequest — backend correctly rejects missing 'file' field
  ℹ  Frontend bug confirmed: Research.tsx sends field="document" but FileInterceptor expects field="file"

── Test G: POST /:id/documents  field="file" (correct → 201)
  ✅ PASS — 201 Created — document stored in MinIO, metadata in MongoDB
  ℹ  Document stored: [{"name":"test.txt","minioKey":"69ad5a1c.../...-test.txt",...}]

── Test H: GET /research-service/research  (no token → 401)
  ✅ PASS — 401 Unauthorized — JwtAuthGuard enforced on all research endpoints

── Test I: DELETE /research-service/research/:id  (owner delete → 200)
  ✅ PASS — 200 OK — project deleted successfully

════════════════════════════════════════════════════════════
  Results: 9 passed, 0 failed
ALL TESTS PASSED ✅
```

## 🧪 Completed Test

### Issue 8: Web App → Analytics Service: Wrong URL Path
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue8.js` + `setup_temp_users.sh`
- **Description:** Web app was calling `/api/v1/analytics-service/overview`. After ingress rewrite this resolved to `/api/v1/overview` — no controller registered there. The fix routes to `/api/v1/analytics-service/analytics/overview` which maps to `@Controller('analytics')` + `@Get('overview')`.

#### Implementation Audit (Pre-Test)
| File | Call Site | Path Used | Status |
|---|---|---|---|
| `Dashboard.tsx:32` | `api.get(...)` — stat cards | `/api/v1/analytics-service/analytics/overview` | ✅ Correct |
| `Analytics.tsx:33` | `api.get(...)` — analytics page | `/api/v1/analytics-service/analytics/overview` | ✅ Correct |

#### Routing Chain
| Frontend Request | After Ingress Rewrite | Backend Matches |
|---|---|---|
| `/api/v1/analytics-service/analytics/overview` | `/api/v1/analytics/overview` | `@Controller('analytics')` + `@Get('overview')` ✅ |
| `/api/v1/analytics-service/overview` (old) | `/api/v1/overview` | No controller → 404 ✅ |

#### Test Results
```
══════════════════════════════════════════════════════════
  Issue 8 — Web App → Analytics Service: Wrong URL Path
══════════════════════════════════════════════════════════

Student sub : cc647fdf-4791-49d5-8dba-724d0da53fd1
Admin sub   : cf991357-c4bc-47f2-9084-200327d5a101

── Test A: GET /analytics-service/analytics/overview  (correct URL)
  ✅ PASS — 200 OK — ingress correctly forwards to @Controller("analytics")

── Test B: GET /analytics-service/overview  (old wrong URL)
  ✅ PASS — 404 — bare /overview path NOT matched (original bug confirmed fixed)

── Test C: Response shape — { users, posts, jobs, events } all numeric ≥ 0
  ✅ PASS — All required fields present
  ✅ PASS — users=1, posts=46, jobs=0, events=0 (all numbers)
  ✅ PASS — All counts ≥ 0
  ℹ  events=0 — Issue 34 (v3 uses collection("events") not "evententities") — tracked separately

── Test D: Dashboard binding
  ✅ PASS — StatData: { users:1, posts:46, jobs:0, events:0 }

── Test E: GET /analytics/posts  → 200, array of 3 posts
── Test F: GET /analytics/jobs   → 200, array of 0 job aggregations
── Test G: GET /analytics/users  → 200, array of 1 daily bucket

── Test H: GET /analytics/latencies (admin + RBAC)
  ✅ PASS — admin → 200 OK (RolesGuard accepted)
  ℹ  Prometheus unreachable in local env — graceful error, no 500
  ✅ PASS — student → 403 (RBAC correctly enforced)

══════════════════════════════════════════════════════════
  Results: 11 passed, 0 failed
ALL TESTS PASSED ✅
```

#### Side Discovery
Running `analytics-service:v3` uses `collection('events')` — actual MongoDB collection is `evententities`. This causes `events=0` in `getOverview()`. This is **Issue 34's bug**, not an Issue 8 routing concern. When Issue 34 is tested, the analytics-service will need to be rebuilt and its image tag incremented.

## 🧪 Completed Test

### Issue 7: Feed Service Response Format Mismatch
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue7.js` + `setup_temp_users.sh`
- **Description:** `getFeed()` was returning a raw `PostDocument[]` array. The frontend (`Feed.tsx`, `Dashboard.tsx`) reads `res.data.items` and `res.data.meta.totalPages` from a paginated envelope object — both are `undefined` on a raw array. A second bug was discovered in the Redis cache key: `limit` was not part of the key, so `limit=3` returned 10 cached items and different `limit` values across pages caused overlapping posts.

#### Root Cause Chain
| # | Bug | Effect |
|---|---|---|
| 1 | `getFeed()` returned raw `PostDocument[]` | `res.data.items` undefined in frontend → blank feed |
| 2 | Cache key `feed:page:N:role:X` omits `limit` | `limit=3` gets 10 items; page overlap when limit varies |

#### Implementation Fixes Applied
| File | Change |
|---|---|
| `services/feed-service/src/feed/feed.service.ts` | Return `{ items, meta: { totalPages, page } }` envelope |
| `services/feed-service/src/feed/feed.service.ts` | Cache key changed to `feed:page:${page}:limit:${limit}:role:${role}` |
| `k8s/services/feed-service/deployment.yaml` | Image bumped from `v8` → `v9` |

#### Test Results
```
═══════════════════════════════════════════════════════
  Issue 7 — Feed Service: Response Format Mismatch
═══════════════════════════════════════════════════════

Student sub : 25a5be36-a60d-43eb-911a-02b67d6977d4

── Test A: Envelope shape
  ✅ PASS — Response body is an object (not raw array)
  ✅ PASS — body.items is an array (10 posts)
  ✅ PASS — body.meta present: {"totalPages":5,"page":1}

── Test B: items[] content
  ✅ PASS — Post has all required fields: _id, userId, content, likes, createdAt
  ✅ PASS — post.userId is UUID string (not ObjectId)
  ✅ PASS — post.likes is an array

── Test C: Pagination meta
  ✅ PASS — meta.totalPages = 5 (number ≥ 1)
  ✅ PASS — meta.page = 1 (matches requested page=1)

── Test D: Pagination — page 1 and page 2 no overlap
  ✅ PASS — Page 1 and page 2 have no overlapping posts (5 + 5 unique posts)
  ✅ PASS — Page 2 response meta.page = 2

── Test E: Role filter
  ✅ PASS — Role filter works — all 4 posts have authorRole=student

── Test F: Dashboard widget — limit=3 respected
  ✅ PASS — Dashboard call returns 3 items (≤ 3 limit respected)
  ✅ PASS — res.data.items || res.data || [] resolves correctly

── Test G: Regression check
  ✅ PASS — REGRESSION CHECK PASSED — response is envelope, not raw array

═══════════════════════════════════════════════════════
  Results: 14 passed, 0 failed
ALL TESTS PASSED ✅
```

#### Failure History (before fix)
| Iteration | Symptom | Root Cause |
|---|---|---|
| 1 | Tests D & F failed | Redis cache key missing `limit` — `limit=3` returned 10 items; page 2 with `limit=5` had 5 duplicate posts with page 1 |
| 2 | All 14 tests pass | Cache key fixed to include `limit`; rebuilt as v9 |

## 🧪 Completed Test

### Issue 6: Web App → Feed Service URL Path Routing
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue6.js` + `setup_temp_users.sh`
- **Description:** The Web App was calling `/api/v1/feed-service/posts`. After Ingress rewrite (`rewrite-target: /api/v1/$2`), this resolved to `/api/v1/posts`. The Feed Service controller is `@Controller('feed')`, so the actual endpoint is `/api/v1/feed`. `posts` ≠ `feed`, causing a permanent 404 on all feed operations.

#### Implementation Audit
| File | Call Site | Path Used | Status |
|---|---|---|---|
| `web/src/pages/Feed/Feed.tsx:35` | `api.get(...)` — feed page load | `/api/v1/feed-service/feed` | ✅ Correct |
| `web/src/pages/Feed/Feed.tsx:87` | `api.post(...)` — create post | `/api/v1/feed-service/feed` | ✅ Correct |
| `web/src/pages/Feed/Feed.tsx:118` | `api.post(...)` — like post | `/api/v1/feed-service/feed/:id/like` | ✅ Correct |
| `web/src/pages/Dashboard/Dashboard.tsx:40` | `api.get(...)` — dashboard widget | `/api/v1/feed-service/feed?page=1&limit=3` | ✅ Correct |

#### Routing Verification
| Ingress Rule | Rewrite Target | Backend Controller | Result |
|---|---|---|---|
| `/api/v1/feed-service(/\|$)(.*)` | `/api/v1/$2` | `@Controller('feed')` | ✅ `/feed-service/feed` → `/feed` → matched |
| `/api/v1/feed-service/posts` (old) | `/api/v1/posts` | (no controller) | ✅ 404 confirmed |

#### Test Results
```
═══════════════════════════════════════════════════════
  Issue 6 — Web App → Feed Service URL Path Routing
═══════════════════════════════════════════════════════

Student sub : f85e08f2-938f-4383-b378-817b31163834

── Test A: GET /api/v1/feed-service/feed  (correct URL → should be 200)
  HTTP status: 200
  ✅ PASS — 200 OK — ingress correctly rewritten /feed-service/feed → /feed → @Controller("feed") matched

── Test B: GET /api/v1/feed-service/posts  (old wrong URL → should be 404)
  HTTP status: 404
  ✅ PASS — 404 Not Found — old /posts path correctly produces 404 (no controller registered at /api/v1/posts)

── Test C: POST /api/v1/feed-service/feed  (create post via correct URL → should be 201)
  HTTP status: 201
  ✅ PASS — 201 Created — post written, _id: 69ad553ce4f620c75dedf134
  ✅ PASS — userId matches student sub (UUID preserved)

── Test D: GET /api/v1/feed-service/feed?page=1&limit=3  (dashboard feed widget)
  HTTP status: 200
  ✅ PASS — 200 OK — envelope { items[], meta } received. items.length: 3, totalPages: 15

═══════════════════════════════════════════════════════
ALL TESTS PASSED ✅
Issue 6 (Web App → Feed Service URL Path Routing) is confirmed resolved.
```
## 🧪 Completed Test

### Issue 3: NestJS Services Rejecting Valid JWTs (401 Unauthorized)
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue3.js` + `setup_temp_users.sh`
- **Description:** Previously, valid Keycloak RS256 JWTs were rejected by all microservices with a 401 Unauthorized error because the services strictly looked for the `process.env.KEYCLOAK_PUBLIC_KEY` variable, which the Kubernetes `jwt-secret` did not supply (it only contained an internal development symmetric key).

#### Pre-flight Checks
| Check | Result |
|---|---|
| `jwt-secret` in `miniproject` namespace | ✅ Present — `KEYCLOAK_PUBLIC_KEY` and `JWT_PUBLIC_KEY` both populated with 444-char RSA public key |
| `KEYCLOAK_PUBLIC_KEY` in `user-service` pod env | ✅ Confirmed via `kubectl exec printenv` |
| `KEYCLOAK_PUBLIC_KEY` in `feed-service` pod env | ✅ Confirmed via `kubectl exec printenv` |
| Keycloak token algorithm | ✅ RS256 (`kid: VlaJwmOZH0YGb2VSOgFpkTJBlu6vGWUyXA4GhPkxoTQ`) |

#### Test Execution Steps
1. Started Keycloak port-forward: `kubectl port-forward -n miniproject svc/keycloak 18080:8080`
2. `bash setup_temp_users.sh` — provisioned `temp_student`/`temp_admin` in Keycloak, wrote RS256 tokens to `.e2e_student_token` / `.e2e_admin_token`
3. `node test_issue3.js` — executed E2E JWT verification against the live cluster
4. `bash setup_temp_users.sh cleanup` — deleted test users from Keycloak and MongoDB

#### Test Results
```
--- Starting Issue 3 Error Verification (JWT Decoding) ---

Verified Temp Student ID: 13d73780-585c-443d-b9cf-3e766c775c63
Token Algorithm (Should be RS256): RS256

--- Testing Protected User Profile (GET /me) ---
REQ: GET http://miniproject.local/api/v1/user-service/users/me
[PASS] 200 OK. NestJS successfully validated the RS256 cryptography and decoded the payload.
Received User Profile Email: student@test.com

--- Testing Protected Feed Write (POST /feed) ---
REQ: POST http://miniproject.local/api/v1/feed-service/feed
[PASS] 201 Created. Feed Service accepted the Keycloak token natively.
Created Post ID: 69ad46bbce4018d5acf1f3cf

✅ JWT System is flawless. The Kubernetes Secret is successfully mounting
KEYCLOAK_PUBLIC_KEY into the Node process, avoiding the dev-secret HS256 fallback.
```

> **Note:** In the original (pre-Issue 16 fix) test run, `GET /me` returned `404` (accepted JWT but no MongoDB doc yet). Now that Issue 16 is resolved, `GET /me` correctly returns `200 OK` with auto-provisioned profile on first login — an additional improvement on top of the original fix.

## 🧪 Completed Test

### Issue 5: UUID BSON Casting Crash in Mongoose (500 Internal Server Error)
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue5.js` + `setup_temp_users.sh`
- **Description:** Keycloak generates 36-char UUID subs. Previous Mongoose schemas typed `userId` as `Types.ObjectId` (requires 24-char hex), causing `BSONError` crashes on any operation that stored or queried a UUID.

#### Pre-flight Checks
| Check | Result |
|---|---|
| `post.schema.ts` — `userId` type | ✅ `type: String` (not ObjectId) |
| `post.schema.ts` — `likes` type | ✅ `type: [String]` |
| `notification.schema.ts` — `userId` type | ✅ `type: String` |
| `feed.service.ts` — `getFeed()` return type | ✅ Returns `{ items, meta }` envelope |
| `feed.service.ts` — `likePost()` notification URL | ✅ Uses `/internal/notifications/notify` with `x-internal-token` |
| Running pod image | ✅ `mini_project-feed-service:v8` (rebuilt from current source) |

#### Deployment Issue Discovered During Test
The live deployment was running `mini_project-feed-service:v7` (previously patched via `kubectl set image`) while `deployment.yaml` still specified `latest`. When `eval $(minikube docker-env) && docker build -t mini_project-feed-service:latest` was run, the rollout restart silently kept running `v7`. The same image-tag drift pattern was also discovered on other services (analytics `v3`, notification `v7`, messaging `v2`, research `v4`). See Issue 43.

Procedure applied to fix feed-service:
1. Built with correct name: `docker build -t mini_project-feed-service:latest`
2. Tagged: `docker tag mini_project-feed-service:latest mini_project-feed-service:v8`
3. Patched: `kubectl set image deployment/feed-service feed-service=mini_project-feed-service:v8 -n miniproject`
4. Updated: `k8s/services/feed-service/deployment.yaml` → `image: mini_project-feed-service:v8`

#### Test Results
```
═══════════════════════════════════════════════════════
  Issue 5 — UUID BSON Casting Crash in Mongoose
═══════════════════════════════════════════════════════

Student sub : 4b286a4d-c179-4dbb-94f2-b713f14bd0b7
Admin sub   : 34f2fe2f-ef61-484d-8173-8a337b09dea4

  UUID format confirmed — Keycloak subs are 36-char UUIDs, not MongoDB ObjectIds.

── Test A: POST /feed-service/feed  (UUID stored as userId)
  ✅ PASS — 201 Created
  ✅ PASS — post.userId matches UUID: "4b286a4d-c179-4dbb-94f2-b713f14bd0b7"

── Test B: GET /feed-service/feed  (UUID in response items, envelope shape)
  ✅ PASS — 200 OK — 5 items, totalPages: 9
  ✅ PASS — Our post found, userId is UUID

── Test C: POST /feed-service/feed/:id/like  (UUID into likes[])
  ✅ PASS — 201 OK
  ✅ PASS — likes[] contains UUID: "34f2fe2f-ef61-484d-8173-8a337b09dea4"

── Test D: GET /notification-service/notifications (UUID userId query)
  ✅ PASS — 200 OK — no BSONError on UUID filter

── Test E: GET /notification-service/notifications/count
  ✅ PASS — 200 OK — unread count: 0

ALL TESTS PASSED ✅
Issue 5 (UUID BSON Casting) is fully resolved.
```

## 🧪 Completed Test

### Issue 16 & 4: User Service `upsertFromKeycloak()` Hook Missing — Auto-Provisioning on First Login
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue16_4.js` + `setup_temp_users.sh`
- **Description:** Previously, `upsertFromKeycloak()` existed but was never called. New Keycloak users received 404 on their first `GET /me`. Four layered issues were discovered and fixed during this investigation. All are now resolved.

#### Fixes Applied Before Final Test Pass
| # | File | Change |
|---|---|---|
| 1 | `jwt.strategy.ts` | Added Keycloak claim fallback chain — `name` and `email` are now always non-undefined strings |
| 2 | `users.service.ts` | Changed upsert filter to `$or: [{ keycloakId }, { email }]` to handle Keycloak user re-creation |
| 3 | `users.controller.ts` | Wired `findMe()` → null check → `upsertFromKeycloak()` cleanly; removed stale debug logs |
| 4 | `test_issue16_4.js` | Corrected three wrong assertion field names (`displayName`→`name`, `roles`→`role`, `_id`→`keycloakId`) |
| 5 | `setup_temp_users.sh` | Added `mongosh deleteMany()` step to `cleanup()` to purge MongoDB test documents |

#### Test Execution Steps
1. `bash setup_temp_users.sh create` — Created two test users in Keycloak (`student@test.com`, `admin@test.com`)
2. Rebuild image inside Minikube daemon: `eval $(minikube docker-env) && docker build -t user-service:latest -f services/user-service/Dockerfile services/user-service/`
3. `kubectl rollout restart deployment/user-service -n miniproject` — waited for rollout complete
4. Verified new code loaded: `kubectl exec -n miniproject deploy/user-service -- grep -r "upsertFromKeycloak" /app/dist/` — confirmed present
5. `node test_issue16_4.js` — ran E2E verification

#### Test Results
```
[STEP 1] Obtaining Keycloak token for student@test.com...
  ✅ Token obtained (sub: <UUID>)
[STEP 2] First GET /me — should trigger auto-provisioning...
  ✅ 200 OK
  name:       Test Student
  email:      student@test.com
  role:       student
  keycloakId: <UUID matches Keycloak sub>
[STEP 3] Second GET /me — should be idempotent...
  ✅ 200 OK (idempotent — no duplicate insert)
[STEP 4] Cleanup...
  ✅ Keycloak user deleted
  ✅ MongoDB docs purged

ALL TESTS PASSED ✅
```

#### Failure History (before full fix — for reference)
| Iteration | Symptom | Root Cause |
|---|---|---|
| 1 | `404 User Not Found` | `upsertFromKeycloak()` never wired into `getMe()` |
| 2 | `500 Internal Server Error` | `payload.name` / `payload.email` undefined in Keycloak JWTs → Mongoose `email required` validation crash |
| 3 | `500 Internal Server Error` on re-run | Old MongoDB doc not cleaned up → new Keycloak sub → `{ keycloakId }` filter miss → duplicate email INSERT → unique index violation |
| 4 | "data corrupted" assertion failure | Test was checking `displayName`, `roles`, `_id` — actual fields are `name`, `role`, `keycloakId` |
| 5 | Code fix appeared not to work | `minikube image load` silently skipped already-cached same-tag images; pod was still running old code |

---

## 🧪 Completed Test

### Issue 17: User Service — `findById(id)` CastError (500 → 400/404)
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue17.js` + `setup_temp_users.sh`
- **Description:** Mongoose's `findById()` internally casts its argument to an `ObjectId`. Passing a non-hex string (e.g. a Keycloak UUID) caused a `BSONError: input must be a 24 character hex string` to propagate as an unhandled 500. Fix: guard with `Types.ObjectId.isValid(id)` before calling `findById()`.

#### Implementation Audit (Pre-Test)
| Check | Finding |
|---|---|
| `findById()` has `isValid()` guard in source | ✅ Present — throws `BadRequestException` on invalid format |
| Debug `console.log` statements removed | ✅ Fixed — 3 `[SERVICE] findById` logs removed from production code |
| Live pod (`user-service:latest`) compiled code | ✅ Confirmed — `grep -c "isValid\|BadRequestException"` → **2 matches** in pod |
| `@Get(':id')` restricted to admin role | ✅ `@Roles(UserRole.ADMIN)` + `RolesGuard` applied |

#### Error Response Matrix (After Fix)
| Input | `isValid()` | Response | Before Fix |
|---|---|---|---|
| Valid 24-char hex ObjectId, exists | ✅ true | **200 OK** | 200 OK |
| Valid 24-char hex ObjectId, not in DB | ✅ true | **404 NotFoundException** | 404 (correct) |
| Keycloak UUID string | ❌ false | **400 BadRequest** | **500 CastError** ⚠️ |
| Any non-hex garbage string | ❌ false | **400 BadRequest** | **500 CastError** ⚠️ |

#### Test Results
```
══════════════════════════════════════════════════════════
  Issue 17 — User Service: findById() CastError → 500
══════════════════════════════════════════════════════════

  Admin sub    : 595cb0cc-eaa1-404c-8012-793a88a66734
  Student sub  : 4bd2c941-a64b-4c2c-909f-08f95b6be5a2

[ Pre-flight ] GET /users/me as admin → resolve MongoDB _id
  Admin MongoDB _id  : 69ad615b67bc77d4f5f3085c
  Admin keycloakId   : 595cb0cc-eaa1-404c-8012-793a88a66734

[ Test A ] GET /users/69ad615b67bc77d4f5f3085c (valid ObjectId, existing → 200)
  ✅ PASS: Status 200 OK — document returned for valid ObjectId
  ✅ PASS: Returned document _id matches the requested ObjectId
  ✅ PASS: keycloakId preserved in document

[ Test B ] GET /users/595cb0cc-eaa1-404c-8012-793a88a66734 (Keycloak UUID → 400, not 500)
  ✅ PASS: Status 400 BadRequest — CastError avoided (UUID correctly rejected)
  ✅ PASS: No unhandled 500 Internal Server Error

[ Test C ] GET /users/not-an-id (garbage string → 400, not 500)
  ✅ PASS: Status 400 BadRequest — garbage string rejected cleanly
  ✅ PASS: No unhandled 500 Internal Server Error

[ Test D ] GET /users/507f1f77bcf86cd799439011 (valid format, non-existent → 404)
  ✅ PASS: Status 404 NotFoundException — valid format, user not found, clean 404
  ✅ PASS: No unhandled 500 CastError

[ Test E ] GET /users/:id with student token → 403 (RBAC enforced)
  ✅ PASS: Status 403 Forbidden — RolesGuard(admin) correctly blocks student access

══════════════════════════════════════════════════════════
  Issue 17 Results: 10 passed, 0 failed
  ✅ ISSUE 17 RESOLVED — findById() CastError is fully guarded.
```

## 🧪 Completed Test

### Issue 14: CI/CD uses `npm ci` but `package-lock.json` is missing
- **Status:** ✅ Passed
- **Test Date:** 2026-03-08
- **Test Script:** `test_issue14.js`
- **Description:** The CI/CD pipeline was failing at the `Install dependencies` step because `npm ci` requires a `package-lock.json` which was absent. A temporary workaround had changed `npm ci` → `npm install`. The correct fix restores `npm ci` (now that the root lock file exists) and also corrects `cache-dependency-path` to the root `package-lock.json` (not per-service `package.json`).

#### Implementation Audit (Pre-Test)
| Check | Finding | Status |
|---|---|---|
| Root `package-lock.json` exists | `468KB`, lockfileVersion 3, 955 packages | ✅ |
| Lock file covers all 8 services | All `services/*` workspace keys present | ✅ |
| No per-service lock files | Correct — monorepo uses single root lock | ✅ |
| `ci-cd.yml` install command | Was `npm install` (workaround) → changed back to `npm ci` | ✅ Fixed |
| `cache-dependency-path` | Was `services/${{ matrix.service }}/package.json` → changed to `package-lock.json` | ✅ Fixed |

#### Changes Applied
**`.github/workflows/ci-cd.yml`** — `lint-and-test` job:
```yaml
# Before (workaround):
cache-dependency-path: services/${{ matrix.service }}/package.json
run: npm install

# After (correct fix):
cache-dependency-path: package-lock.json
run: npm ci
```

#### Test Results
```
══════════════════════════════════════════════════════════
  Issue 14 — CI/CD: npm ci + package-lock.json validation
══════════════════════════════════════════════════════════

── Test A: Root package-lock.json exists
  ✅ PASS: Root package-lock.json exists
── Test B: lockfileVersion >= 2 (npm v7+ workspaces support)
  ✅ PASS: lockfileVersion 3 — workspace-compatible
── Test C: Lock file contains entries for each service workspace
  ✅ PASS: All 8 service workspaces represented in lock file
── Test D: Lock file has substantial package count (>100)
  ✅ PASS: Lock file has 955 package entries (full dependency graph)
── Test E: No per-service package-lock.json files
  ✅ PASS: No per-service package-lock.json files — root lock file is sole source of truth
── Test F: npm ci --dry-run succeeds at workspace root
  ✅ PASS: npm ci --dry-run completed without error
── Test G: ci-cd.yml uses "npm ci" for Install dependencies step
  ✅ PASS: ci-cd.yml uses "npm ci" — reproducible installs enforced
  ✅ PASS: ci-cd.yml does NOT contain "npm install" (old workaround removed)
── Test H: cache-dependency-path points to root package-lock.json
  ✅ PASS: cache-dependency-path: package-lock.json — correct for monorepo root
  ✅ PASS: cache-dependency-path does NOT point at individual service package.json
── Test I: Service package.json scripts inspected
  ✅ PASS: All service package.json files inspected — missing scripts handled by --if-present flag in CI

══════════════════════════════════════════════════════════
  Issue 14 Results: 11 passed, 0 failed
  ✅ ISSUE 14 RESOLVED — CI/CD uses npm ci with correct package-lock.json.
```

---

## ✅ Web App E2E Integration Test (task.md §9.12) — 2026-03-08

**Test file:** `test_e2e_web_integration.js`
**Result:** 48/48 assertions passed
**Tokens:** Keycloak RS256 JWTs from `setup_temp_users.sh` (temp_student + temp_admin)
**Cluster:** Minikube — all 8 service pods Running

```
T1  · Auth + Dashboard — 4 assertions passed
      JWT accepted, /me returns user, dashboard feed preview 200, all 8 health 200
T2  · Feed Post → Appears in Feed — 5 assertions passed
      POST /feed → 201, _id present, GET /feed 200, new post in items[], like → 201
T3  · Job Apply → Analytics — 5 assertions passed
      Admin creates job, student applies, notifications 200, analytics/jobs 200
T4  · RSVP Idempotency — 5 assertions passed
      Create event, RSVP ×2, attendee count = 1 (no double-count)
T5  · Research Project + Docs — 6 assertions passed
      Create project, GET /documents empty 200, project in list
T6  · Profile PATCH → Persists — 3 assertions passed
      PATCH /users/me, re-fetch confirms name updated
T7  · Admin Analytics — 6 assertions passed
      overview/posts/jobs/users all 200, overview has correct keys, latencies 200
T8  · InfraStatus Health JSON — 8 assertions passed
      All 8 services return {status:'ok'} (messaging-service normalised to lowercase)
T9  · RBAC Guards — 3 assertions passed
      Student → /latencies 403, student → /overview 200, no-token → 401
T10 · Notifications Mark-All-Read — 3 assertions passed
      PATCH /read-all 200, unread count = 0 after mark
```

**Pages covered by test:** Dashboard, Feed, Jobs, Events, Research, Notifications, Profile, Analytics, InfraStatus (all 9)
**Task.md §9.12 status:** ✅ All cluster scenarios verified — 48/48 passed

---

---

## ✅ Phase 10 — Final Integration & Stability (task.md §10) — 2026-03-08

**Test file:** `test_phase10.js`
**Result:** 90/90 assertions passed
**Duration:** ~5 minutes (includes failure simulation wait times)
**Service fixes deployed:** feed-service:v10 (Redis fallback), research-service:v6 (MinIO 503)

```
§10.1 Staged Integration (13 stages) — 29 assertions passed
  Stages 1-4:  MongoDB, Redis, MinIO, Keycloak all Running
  Stage 5:     User Service /me JWT accepted
  Stage 6:     Feed Service .items array returned
  Stage 7-12:  Job, Event, Notification, Research, Analytics, Messaging all 200
  Stage 13:    All 8 Ingress routes → 200
  E2E Journey: POST /feed → 201, apply job → 200, analytics/jobs → 200

§10.2 Namespace Isolation — 18 assertions passed
  12 service + infra pods in miniproject namespace (none in default)
  NetworkPolicy defined; kube-system isolated from miniproject
  Unregistered routes → 404 (no cross-namespace leakage)
  All 9 web app pages smoke-pass against integrated backend

§10.3 Failure Simulations — 43 assertions passed
  A. MongoDB-0 killed → StatefulSet recreated → health+data restored (10 s stabilisation)
  B. Feed pod killed → K8s restart in 18 s → feed-service:v10 confirmed → E2E passes
  C. +100ms netem delay on minikube eth0 → all 7 services ≈102 ms → delay removed < 500 ms
  D. Redis scale-to-0 → GET /feed 200 (MongoDB fallback) → POST /feed 201 → Redis restored
  E. MinIO scale-to-0 → GET /feed 200, GET /docs 200 → POST text 201 → MinIO restored
  After every scenario: 3-assertion smoke journey (feed, /me, analytics) passed
```

**Resilience fixes (required for §10.3):**
- `services/feed-service/src/redis/redis.service.ts` — added `maxRetriesPerRequest:0`, `enableOfflineQueue:false`, all methods wrapped in try/catch returning null/[] on error
- `services/feed-service/src/minio/minio.service.ts` — `uploadFile()` wrapped in try/catch → throws `ServiceUnavailableException` (HTTP 503)
- `services/research-service/src/research/research.service.ts` — `putObject()` wrapped in separate try/catch → throws `ServiceUnavailableException` (HTTP 503)

---

## 📋 Verification Backlog

- [x] Issue 1: Frontend API Route Mismatch (General Web App URL Sweep) — ✅ Passed 2026-03-08
- [x] Issue 6: Web App → Feed Service URL Path Routing — ✅ Passed 2026-03-08
- [x] Issue 7: Feed Service Response Format Mismatch — ✅ Passed 2026-03-08
- [x] Issue 8: Web App → Analytics Service URL Path — ✅ Passed 2026-03-08
- [x] Issue 9: Web App → Research Service URL Path — ✅ Passed 2026-03-08
- [x] Issue 10: Notification Service: Missing GET /count endpoint — ✅ Covered by Issue 5 (test_issue5.js Test E) 2026-03-08
- [x] Issue 11: Empty UI Components Directory — ✅ `test_issue11.js` 37/37 passed (all files exist, forwardRef+clsx+TS compilation verified) 2026-03-08
- [x] Issue 12: Empty Hooks Directory — ✅ `test_issue12.js` 26/26 passed (useAuth guard, useFetch generic hook, TS compilation verified; fixed 3 TS errors: AuthContext export, api named import, import type for axios types) 2026-03-08
- [x] Issue 18: Feed Service Web App URL mismatch — ✅ Covered by Issue 6 (test_issue6.js Test D) 2026-03-08
- [x] Issue 3: NestJS Services Rejecting Valid JWTs — ✅ Passed 2026-03-08
- [x] Issue 4: GET /me 404 for new Keycloak users — ✅ Passed 2026-03-08
- [x] Issue 5: UUID BSON Casting Crash in Mongoose — ✅ Passed 2026-03-08
- [x] Issue 16: `upsertFromKeycloak()` never called — ✅ Passed 2026-03-08
- [x] Issue 39: JWT strategy reads undefined Keycloak claims — ✅ Fixed as part of Issue 16
- [x] Issue 40: `minikube image load` ignores same-tag images — ✅ Resolved procedurally
- [x] Issue 41: Wrong field names in `test_issue16_4.js` — ✅ Fixed
- [x] Issue 42: `setup_temp_users.sh` did not purge MongoDB — ✅ Fixed
- [x] Issue 43: Kubernetes deployment image tag drift — ✅ Documented & procedure established
- [x] Issue 17: User Service: findById(id) raw string mapping error — ✅ `test_issue17.js` 10/10 passed (400 on UUID/garbage, 404 on valid-format non-existent, 200 on valid+existing, 403 student RBAC) 2026-03-08
- [x] Issue 19: Feed Service Envelope wrapper mismatch — ✅ Covered by Issue 7 (test_issue7.js Tests A/C/G) 2026-03-08
- [x] Issue 20: Feed Service: Missing query filter support in getFeed() — ✅ Covered by Issue 7 (test_issue7.js Test E) 2026-03-08
- [x] Issue 21: Feed Service: MulterModule Default Implicit Storage — ✅ `test_issue21.js` 8/8 passed (source audit, pod grep, JPEG/PNG upload buffer-accessible, no-file null-ref, 401 unauth, regression guard) 2026-03-08
- [x] Issue 22: Job Service: No Duplicate-Application Guard — ✅ `test_issue22_23.js` 13/13 passed (UUID BSONError fixed: postedBy/applicantId as String; compound unique index enforced; 409 on duplicate, 400 on closed job, 403 RBAC) 2026-03-08
- [x] Issue 23: Job Service: withRetry() Deterministic Delay — ✅ `test_issue22_23.js` Tests H/I/J passed (duplicate apply response 7ms — no retry cycle; ValidationError/CastError/code 11000 all skip retry in source) 2026-03-08
- [x] Issue 24: Event Service: Missing GET /:id Endpoint — ✅ `test_issue24_25_26.js` 16/16 passed (UUID BSONError: createdBy/rsvps as String; GET /:id returns 200; 400 on garbage/UUID, 404 on non-existent; RSVP with UUID string, idempotent $addToSet, 400 on ended, 403 RBAC) 2026-03-08
- [x] Issue 25: Event Service: Mongoose findById() CastError — ✅ `test_issue24_25_26.js` Tests C/D/E/K passed (400 on garbage, 400 on UUID, 404 on valid-format non-existent) 2026-03-08
- [x] Issue 26: Event Service: Race Condition Typing on rsvp() — ✅ `test_issue24_25_26.js` Tests F/G/H/L/M passed (UUID strings in rsvps, $addToSet idempotent, null-check guard present, attendees list correct) 2026-03-08
- [x] Issue 27: Notification Service: Missing GET /notifications/count — ✅ Covered by Issue 5 (test_issue5.js Test E) 2026-03-08
- [x] Issue 28: Notification Service: Silent Null on markRead — ✅ `test_issue28_29.js` 16/16 passed (404 on non-existent, 404 on ownership mismatch, read=true in response, unread-filter excludes read notifs, markAllRead returns count) 2026-03-08
- [x] Issue 29: Notification Service: Inter-Service Authenticative Tokens — ✅ `test_issue28_29.js` Tests G/H/I/J/K passed (201 valid token, 401 wrong token, 401 no token, 400 invalid DTO; notification-service rebuilt to v8 with InternalController) 2026-03-08
- [x] Issue 30: Research Service: Missing Validation Constraints — ✅ `test_issue30_31_32_33.js` Tests A/B/C/D passed (400 missing title, 400 short title, 400 invalid enum, extra fields stripped; research-service rebuilt to v5 with ValidationPipe + @MinLength(3) + @IsEnum compiled) 2026-03-08
- [x] Issue 31: Research Service: uploadDocument() Undefined Attachment — ✅ `test_issue30_31_32_33.js` Test F passed (400 BadRequest: 'A file attachment is required' on missing file; controller null-guard compiled in v5) 2026-03-08
- [x] Issue 32: Research Service: Upload Operation Atomicity — ✅ `test_issue30_31_32_33.js` Tests G/H passed (source audit confirms try/catch around project.save() + minioClient.removeObject() compensation in catch block) 2026-03-08
- [x] Issue 33: Research Service: Blind Collaborator Appendings — ✅ `test_issue30_31_32_33.js` Tests I/J/K/M passed (400 non-UUID, 400 empty string, 201 valid UUID; @IsUUID() on InviteCollaboratorDto compiled in v5) 2026-03-08
- [x] Issue 34: Analytics Service: Hardcoded Target Collection Flaw — ✅ `test_issue34_35_36.js` Tests A/B passed (source uses `evententities`, overview returns correct events count; analytics-service rebuilt to v5) 2026-03-08
- [x] Issue 35: Analytics Service: Unverified Payload Attributes — ✅ `test_issue34_35_36.js` Tests C–J passed (limit=abc/0/-5 → 400, limit=5 → 200, days=xyz/0 → 400, days=7 → 200; Number.isInteger guard + BadRequestException compiled in v5) 2026-03-08
- [x] Issue 36: Analytics Service: Tightly Coupled TSD PromQL Formatting — ✅ `test_issue34_35_36.js` Tests K/L/M passed (source uses {__name__=~".*bucket"} regex, admin endpoint 200 OK, student → 403; compiled in v5) 2026-03-08
- [x] Issue 14: CI/CD uses `npm ci` but `package-lock.json` is missing — ✅ `test_issue14.js` 11/11 passed (root package-lock.json lockfileVersion 3 with 955 packages, all 8 services in lock, npm ci --dry-run succeeds, YAML restored to `npm ci`, cache-dependency-path fixed to root package-lock.json) 2026-03-08
- [ ] Issue 15: Analytics Service HPA CPU threshold inconsistency — ⬜ Not started
- [x] **task.md §9.12 Web App E2E Integration** — ✅ `test_e2e_web_integration.js` **48/48 assertions** passed — all 9 app pages, 10 test groups covering auth, feed, jobs, events, research, profile, analytics, infra health, RBAC, notifications — 2026-03-08
- [x] **task.md Phase 10 Final Integration & Stability** — ✅ `test_phase10.js` **90/90 assertions** passed — staged integration (13 stages), namespace isolation, 5 failure simulations (MongoDB kill, Feed pod kill, +100ms delay, Redis scale-to-0, MinIO scale-to-0) — 2026-03-08

*(UI and infrastructural issues to be verified subsequently.)*

