# Known Issues & Error Log

This document serves as a persistent knowledge base for errors encountered during the development and testing of the Mini-Project system. 

When encountering and resolving a new issue, please log it here using the following template:

## 📝 Error Log Template
```markdown
### [Issue Title / Error Message]
- **Date Logged:** YYYY-MM-DD
- **Component(s) Affected:** [e.g., Web App, Feed Service, Ingress]
- **Context / When it Happens:** [Brief description of what action triggers the error]
- **Error Signature:** [Stack trace snippet, HTTP status, or observed behavior]
- **Root Cause:** [Technical explanation of *why* it failed]
- **System Impact:** [How this affects the application/users if left unfixed]
- **Resolution / Fix:** [Step-by-step technical description of how the issue was solved in the codebase/infrastructure]
```

---

## 🛑 Resolved Issues (Phase 9 E2E Testing)

### 46. Localhost Dev Login Callback Breakage (`cookie_not_found`) Under HTTP Origin
- **Date Logged:** 2026-03-18
- **Resolution Date:** 2026-03-18
- **Component(s) Affected:** Web Dev Runtime (Vite), Keycloak Client Config (`react-web-app`), Frontend Auth Initialization
- **Context / When it Happens:** Browser login from `http://localhost:5173` returned Keycloak callback failure despite valid e2e credentials.
- **Error Signature:** Keycloak `LOGIN_ERROR` with `error="cookie_not_found"`; credentials still produced token endpoint HTTP 200.
- **Root Cause:** Auth callback started from insecure localhost HTTP origin while Keycloak session cookies required secure callback continuity.
- **System Impact:** Interactive browser login failed even with valid credentials, blocking dashboard navigation.
- **Resolution / Fix:**
  - Added HTTPS dev mode in Vite (`npm run dev:https`) on `https://localhost:5174`.
  - Hardened Keycloak `react-web-app` client to HTTPS redirect/origin set:
    - `https://localhost:5174/*`
    - `https://miniproject.local/*`
  - Removed HTTP localhost callback path from login-required flow by rejecting `http://localhost:5173` redirect.
  - Added frontend insecure-origin auth guard with actionable message to prevent broken loop on HTTP localhost.
  - Final browser fix: switched frontend Keycloak URL from proxied relative `/auth` to explicit `https://miniproject.local/auth` (configurable via `VITE_KEYCLOAK_URL`) to avoid cookie domain split between localhost proxy and absolute Keycloak login-actions host.
- **Verification Evidence:**
  - Secure callback with `e2e_admin`: `302` redirect to `https://localhost:5174/?code=...`.
  - Repeated callback stability: `3/3` passes for `e2e_admin`.
  - Multi-user secure callback passes: `e2e_student`, `e2e_alumni`.
  - Protected API checks post-auth token: all three e2e users return `200` on `/api/v1/user-service/users/me`.
  - Post-fix immediate Keycloak log window (`--since=1m`) after focused secure callback: no new `cookie_not_found`.

### 45. System Outage After Minikube Stop + Keycloak Realm Reset + Stale JWT Public Key
- **Date Logged:** 2026-03-18
- **Resolution Date:** 2026-03-18
- **Component(s) Affected:** OS/Runtime Layer, Minikube/Kubernetes Control Plane, Keycloak Auth, jwt-secret, All Protected NestJS APIs, Frontend Auth Proxy
- **Context / When it Happens:** Full verification run failed with timeouts and auth breakage after environment restart.
- **Error Signature:**
  - `kubectl` timeouts to `https://192.168.59.101:8443`
  - `curl` timeout to `http(s)://miniproject.local`
  - Keycloak token endpoint: `{"error":"Realm does not exist"}`
  - Protected API 401: `Invalid or missing JWT token`
  - Backup CronJob pod `ImagePullBackOff` for `mini_project-backup:v2`
- **Root Cause:** Multi-layer failure chain:
  1. Minikube VM was stopped (platform unreachable).
  2. Keycloak restarted with a fresh DB state (miniproject realm/clients/users missing).
  3. `jwt-secret` still contained an old Keycloak public key, so RS256 token verification failed.
  4. `tests/e2e/setup_personas.sh` assumed a root Keycloak path and failed against `/auth` relative-path deployments.
  5. Backup image was not present in active minikube Docker runtime.
- **System Impact:** End-to-end login and dashboard flows were non-functional; protected APIs returned 401; operational backup job failed.
- **Resolution / Fix:**
  - Restarted minikube with the correct profile driver (`virtualbox`).
  - Restored Keycloak realm, roles, and required clients (`react-web-app`, `e2e-test-client`).
  - Patched `tests/e2e/setup_personas.sh` to auto-detect `/auth` base path.
  - Recreated personas and regenerated JWT artifacts (`.e2e_*_token`, `.e2e_*_id`).
  - Rotated `jwt-secret` public keys (`KEYCLOAK_PUBLIC_KEY`, `JWT_PUBLIC_KEY`) from live realm key and restarted all deployments.
  - Built `mini_project-backup:v2` inside minikube Docker daemon and validated backup job completion.
  - Verified backend health endpoints and protected endpoints return 200; verified frontend dev server and proxy auth/api routes return 200.
- **Detailed Recovery Log:** `docs/known_issues/system_restore_2026-03-18.md`

### 0. Keycloak Login Error: "Cookie not found. Please make sure cookies are enabled in your browser."
- **Date Logged:** 2026-03-18
- **Resolution Date:** 2026-03-18
- **Component(s) Affected:** Keycloak Auth Flow, NGINX Ingress, React Web App Login
- **Context / When it Happens:** Browser is redirected to Keycloak for login from the web app and returns with a Keycloak error page stating cookie was not found.
- **Error Signature:** `Cookie not found. Please make sure cookies are enabled in your browser.`
- **Root Cause:** Auth flow was being served over plain HTTP (`http://miniproject.local/auth`). Keycloak issues session cookies with `SameSite=None; Secure`. On non-HTTPS origins, modern browsers may not persist/send these secure cookies, causing session continuity failure during OIDC redirect callbacks.
- **System Impact:** User login can fail intermittently or consistently depending on browser policy, even when backend services are healthy.
- **Resolution / Fix:** Migrated ingress to HTTPS-first behavior using cert-manager certificate and TLS on all ingresses (`auth-ingress.yaml`, `ingress.yaml`, `minio-ingress.yaml`) with forced SSL redirect annotations:
  - `nginx.ingress.kubernetes.io/ssl-redirect: "true"`
  - `nginx.ingress.kubernetes.io/force-ssl-redirect: "true"`
  - `spec.tls.hosts: [miniproject.local]` with `secretName: miniproject-tls-secret`
  Kept frontend Keycloak URL as relative `/auth` so the app remains environment-agnostic and follows ingress protocol.

### 1. Frontend API Route Mismatch (404 Not Found)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** React Web App (`web/src/*`), Kubernetes NGINX Ingress
- **Context / When it Happens:** When the React frontend attempted to fetch data from any backend microservice (e.g., loading the Feed, fetching Projects).
- **Error Signature:** HTTP `404 Not Found` across all service calls.
- **Root Cause:** The frontend was requesting paths like `/api/v1/feed-service/posts`. The Kubernetes Ingress is configured to strip `/api/v1/feed-service` and forward the rest (`/posts`) to the backend. However, the backend NestJS controller was explicitly listening on `@Controller('feed')`. Thus, the backend received `GET /posts` but expected `GET /feed`.
- **System Impact:** Complete communication breakdown between frontend UI and backend services.
- **Resolution / Fix:** Performed a system-wide refactor in the React codebase. Replaced all arbitrary frontend `axios` call paths to precisely match the `@Controller` decorators defined in the NestJS microservices (e.g., changing `/posts` to `/feed`, `/projects` to `/research`). **(Tested: Passed - Non-mocked E2E integration verification succeeded. Native temporary Keycloak test users (`student` & `admin` roles) were automatically provisioned and correctly traversed the Kubernetes NGINX Ingress rules to retrieve synchronous 200 OK payloads from the Feed, Job, Event, and Analytics backend services).**

### 2. Missing Keycloak Admin User & Realm (Authentication Failure)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Keycloak Kubernetes StatefulSet
- **Context / When it Happens:** During cluster bootstrap, attempting to log into the Keycloak Admin Console or generate a system token.
- **Error Signature:** "Invalid credentials" or missing `miniproject` realm.
- **Root Cause:** The Keycloak H2 database was wiped between phases. When Keycloak restarted, it did not recreate the `admin` user because Keycloak 23+ strictly requires `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD` environment variables to be present during a "first boot" to trigger the admin bootstrap sequence.
- **System Impact:** Total authentication lockout; impossible to acquire JWTs.
- **Resolution / Fix:** Discovered the persistent source code was missing the admin key structure completely. Updated `k8s/secrets/keycloak-secret.yaml` permanently in source control to include `KEYCLOAK_ADMIN` and changed the namespace to `miniproject`. Applied via kubectl; deleted the H2 database again to force a fresh initialization, and ran the `kcadm.sh` bootstrap scripts to recreate the realm, clients, and test users. **(Tested: Passed - Authentication with Keycloak Master admin REST API succeeds natively via the exact YAML credentials).**

### 3. NestJS Services Rejecting Valid JWTs (401 Unauthorized)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** All 7 NestJS Microservices, `k8s/secrets/jwt-secret.yaml`
- **Context / When it Happens:** A user successfully logs in via Keycloak and sends their valid JWT Bearer token to a microservice.
- **Error Signature:** HTTP `401 Unauthorized` with `{"message":"Invalid or missing JWT token"}`.
- **Root Cause:** When the Keycloak realm was recreated, it generated a new RS256 token signing key. The Kubernetes secret was injecting this new key as `JWT_PUBLIC_KEY`. However, the NestJS `jwt.strategy.ts` code was written to explicitly look for `process.env.KEYCLOAK_PUBLIC_KEY`. Finding it missing, the services fell back to a placeholder development secret, causing legitimate RS256 tokens to fail cryptographic validation.
- **System Impact:** Valid users could not access any protected API endpoints.
- **Resolution / Fix:** Updated `k8s/secrets/jwt-secret.yaml` permanently in source control to include the `KEYCLOAK_PUBLIC_KEY` variable, injecting the actual Keycloak RS256 public key into the pods. Restarted all service pods to consume the correct secret.
- **Tested:** ✅ Passed — 2026-03-08 via `test_issue3.js`
  - Pre-test: confirmed `KEYCLOAK_PUBLIC_KEY` is actively injected into `user-service` and `feed-service` pods via `kubectl exec printenv`
  - `GET /api/v1/user-service/users/me` with Keycloak RS256 Bearer token → **200 OK** (JWT validated, profile returned)
  - `POST /api/v1/feed-service/feed` with Keycloak RS256 Bearer token → **201 Created** (post written)
  - No `401 Unauthorized` returned — RS256 cryptographic signature accepted by `passport-jwt` using the mounted `KEYCLOAK_PUBLIC_KEY`
  - *(Note: the original fix test observed a 404 on `/me` as a secondary symptom of Issue 4/16 which were unresolved at the time. After Issue 16 was fixed, the same test now returns 200 OK confirming both layers work correctly.)*

### 4. Missing User Profile in MongoDB (404 User Not Found)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** User Service (`users.controller.ts`, `users.service.ts`, `jwt.strategy.ts`, MongoDB)
- **Context / When it Happens:** A newly registered Keycloak user makes their first authenticated request to fetch their profile (`GET /api/v1/user-service/users/me`).
- **Error Signature:** HTTP `404 Not Found` returning `{"message":"User not found"}`.
- **Root Cause:** Keycloak handles Identity/Auth, but the User Service manages application-specific user profiles (bio, avatar, role) in its own MongoDB database. The system lacked an automatic synchronization mechanism to register a user into MongoDB after Keycloak creation. A partial fix existed in `users.controller.ts` (catching null and calling `upsertFromKeycloak()`) but was silently failing at a deeper level — see Issue 39 for the actual root cause of that failure.
- **System Impact:** New users experienced broken profile pages and 500 errors in other services that attempted to fetch their profile data.
- **Resolution / Fix (Final — 2026-03-08):**
  Three separate code changes were required to fully resolve this issue:

  **Step 1 — Fix `jwt.strategy.ts` to extract correct Keycloak claims** (this was the real blocker):
  Keycloak JWTs do not include a `name` field by default. The strategy was reading `payload.name` (always `undefined`) and `payload.email` (sometimes `undefined` on misconfigured realms). When `email: undefined` was passed to `upsertFromKeycloak()`, Mongoose threw a `ValidationError` because `email` is `required: true` in the schema, crashing the upsert with an unhandled 500 before the profile was ever created. Fixed by adding a proper fallback chain:
  - `name`: `payload.name` → `given_name + family_name` → `preferred_username` → `'Unknown User'`
  - `email`: `payload.email` → `preferred_username` → `${sub}@keycloak.local`

  **Step 2 — Fix `upsertFromKeycloak()` filter in `users.service.ts`** to use `$or: [{ keycloakId }, { email }]` instead of matching only `{ keycloakId }`. When a Keycloak user is deleted and recreated (as happens in test teardown/setup cycles), the new user has a different `sub` UUID but the same email. The previous single-field filter would attempt to insert a new document with a duplicate `email`, hitting the unique index constraint and crashing with a 500. The `$or` filter finds and updates the existing document by email even when the Keycloak sub changed.

  **Step 3 — Clean up `getMe()` in `users.controller.ts`**: Removed stale debug `console.log` calls left from the previous partial fix attempt. Controller now cleanly calls `findMe()`, and if null, calls `upsertFromKeycloak()` with fallback values for `email` and `name` as a second defensive layer.

  **(Tested: Passed — `test_issue16_4.js` E2E verification confirms 200 OK, correct `name`, `email`, and `keycloakId` returned on first login, and idempotent on subsequent calls.)**

### 5. UUID BSON Casting Crash in Mongoose (500 Internal Server Error)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Feed Service, Notification Service — `post.schema.ts`, `notification.schema.ts`, `feed.service.ts`, `notifications.service.ts`
- **Context / When it Happens:** Creating a Feed Post, Liking a Post, or checking Notifications.
- **Error Signature:** HTTP `500 Internal Server Error`, with backend pod logs showing: `BSONError: input must be a 24 character hex string, 12 byte Uint8Array, or an integer at new ObjectId(...)`.
- **Root Cause:** Keycloak generates User IDs as 36-character UUID strings (e.g., `9d6b...`). The Mongoose schemas (`post.schema.ts`, `notification.schema.ts`) and Service files were strictly typing the `userId` field as a `Types.ObjectId` (which requires exactly 24 hex characters). Passing the UUID into Mongoose caused an unhandled BSON formatting crash.
- **System Impact:** Core backend features (posting, notifications) completely crashed the Node process.
- **Resolution / Fix:**
  Conducted a structural refactor across the `feed-service` and `notification-service` codebase:
  - `post.schema.ts`: `userId: string` (`type: String, index: true`), `likes: string[]` (`type: [String]`)
  - `notification.schema.ts`: `userId: string` (`type: String, index: true`)
  - `feed.service.ts`: removed all `new Types.ObjectId()` casts; `likePost()` passes `userId` string directly into `$addToSet`
  - `notifications.service.ts`: all `userId` filter queries use plain string comparison
  Additionally, `feed.service.ts` was updated:
  - `getFeed()` now returns `{ items, meta: { totalPages, page } }` envelope instead of raw array
  - `likePost()` notification call changed from `/notifications/notify` (public JWT-auth) to `/internal/notifications/notify` with `x-internal-token` header
- **Tested:** ✅ Passed — 2026-03-08 via `test_issue5.js`
  - POST /feed-service/feed → 201, `post.userId` = Keycloak UUID (not ObjectId)
  - GET /feed-service/feed → 200, envelope `{ items[], meta.totalPages }` returned, UUID preserved
  - POST /feed-service/feed/:id/like → 201, `likes[]` contains admin UUID string
  - GET /notification-service/notifications → 200, UUID userId query returned without BSONError
  - GET /notification-service/notifications/count → 200, `{ count: N }` without BSONError
- **Deployment Note:** The running `feed-service` pod was using the stale `mini_project-feed-service:v7` image (not `latest`). The fix required building with the correct image name (`mini_project-feed-service:latest`) inside Minikube's Docker daemon, tagging as `v8`, and patching via `kubectl set image`. The `k8s/services/feed-service/deployment.yaml` manifest has been updated to `v8`. See Issue 43 for the image-tag drift pattern.

---

## 🛑 Additional Pending Issues Discovered During Manual Scan

### 6. Web App → Feed Service: Wrong URL path
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** React Web App, Kubernetes NGINX Ingress, Feed Service
- **Context / When it Happens:** When loading the Feed page or Dashboard feed.
- **Error Signature:** HTTP `404 Not Found`
- **Root Cause:** Web app calls `GET /api/v1/feed-service/posts`. After ingress strip-and-rewrite (`rewrite-target: /api/v1/$2`), it becomes `GET /api/v1/posts`. However, the Feed controller uses `@Controller('feed')`, so the actual endpoint is `GET /api/v1/feed`. `posts` ≠ `feed`.
- **System Impact:** 🔴 CRITICAL - Every feed load yields 404. *(Note: This issue was partially resolved during E2E testing but is logged here for historical accuracy of the scan)*.
- **Resolution / Fix:** Updated the Web App React Axios endpoints in `Feed.tsx` and `Dashboard.tsx` to use `/api/v1/feed-service/feed` — precisely matching the `@Controller('feed')` path after Ingress rewrite. All three call sites corrected:
  - `GET /api/v1/feed-service/feed` (feed page load, paginated)
  - `POST /api/v1/feed-service/feed` (create post)
  - `POST /api/v1/feed-service/feed/:id/like` (like post)
- **Tested:** ✅ Passed — 2026-03-08 via `test_issue6.js`
  - Test A: `GET /api/v1/feed-service/feed` → **200 OK** — ingress rewrite delivers to `@Controller('feed')` correctly
  - Test B: `GET /api/v1/feed-service/posts` (old wrong path) → **404 Not Found** — confirms no spurious controller registered at `/api/v1/posts`
  - Test C: `POST /api/v1/feed-service/feed` → **201 Created** — post written with UUID `userId` preserved
  - Test D: `GET /api/v1/feed-service/feed?page=1&limit=3` (Dashboard widget path) → **200 OK** with `{ items[], meta }` envelope

### 7. Feed Service: Response format mismatch
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Feed Service `getFeed()`, Redis cache layer, React Web App (`Feed.tsx`, `Dashboard.tsx`)
- **Context / When it Happens:** When successfully fetching the feed at any page or limit.
- **Error Signature:** Frontend cannot render posts; `res.data.items` is `undefined`. Additionally, `?limit=3` returns 10 items, and pages share duplicate posts.
- **Root Cause (two-part):**
  1. **Raw array return**: `getFeed()` was returning a raw `PostDocument[]` array. The frontend explicitly destructures `res.data.items` and `res.data.meta.totalPages`, both of which are `undefined` on a raw array, crashing feed rendering.
  2. **Redis cache key omits `limit`**: The cache key was `feed:page:${page}:role:${role}` without the `limit` dimension. A request with `limit=10` populated the cache, then `limit=3` hit the same key and returned 10 items instead of 3. Worse, `limit=5` on page 2 also hit a cache entry computed with a different `limit`, causing the pagination `skip` to be misaligned and producing overlapping posts between pages.
- **System Impact:** 🔴 CRITICAL — Feed page blank (no posts rendered), pagination broken, Dashboard widget silently shows wrong number of posts.
- **Resolution / Fix:**

  **Fix 1 — `services/feed-service/src/feed/feed.service.ts`**: Wrapped return in `{ items, meta }` envelope:
  ```typescript
  const result = { items, meta: { totalPages, page } };
  await this.redis.set(cacheKey, JSON.stringify(result), FEED_CACHE_TTL);
  return result;
  ```

  **Fix 2 — `services/feed-service/src/feed/feed.service.ts`**: Added `limit` to the Redis cache key:
  ```typescript
  // Before:
  const cacheKey = `feed:page:${page}:role:${role || 'all'}`;
  // After:
  const cacheKey = `feed:page:${page}:limit:${limit}:role:${role || 'all'}`;
  ```
  The cache invalidation patterns in `create()` and `likePost()` use `feed:page:*` which still matches the new key format — no change needed there.

  **Deployment**: Image rebuilt as `mini_project-feed-service:v9`, patched via `kubectl set image`. `k8s/services/feed-service/deployment.yaml` updated to `:v9`.

- **Tested:** ✅ Passed — 2026-03-08 via `test_issue7.js` (14/14 assertions passed)
  - Test A: `GET /feed?page=1&limit=10` → 200, body is object with `items[]` and `meta{}` (not raw array)
  - Test B: `items[0]` has all required fields (`_id`, `userId`, `content`, `likes`, `createdAt`); `userId` is UUID string
  - Test C: `meta.totalPages` = 5, `meta.page` = 1 (matches requested page)
  - Test D: `page=1&limit=5` and `page=2&limit=5` return 0 overlapping posts (pagination skip correct)
  - Test E: `?role=student` returns only posts with `authorRole=student`
  - Test F: `?page=1&limit=3` returns exactly 3 items (limit respected, cache key includes limit)
  - Test G: Regression — response root is object envelope, NOT raw array

### 8. Web App → Analytics Service: Wrong URL path
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** React Web App (`Analytics.tsx`, `Dashboard.tsx`), Kubernetes NGINX Ingress, Analytics Service
- **Context / When it Happens:** When loading Dashboard stat cards or the Analytics page.
- **Error Signature:** HTTP `404 Not Found`
- **Root Cause:** Web app originally called `GET /api/v1/analytics-service/overview`. After ingress rewrite (`rewrite-target: /api/v1/$2`), this resolved to `GET /api/v1/overview`. There is no controller registered at that path. The Analytics controller uses `@Controller('analytics')`, so the correct backend path is `GET /api/v1/analytics/overview`. The frontend was missing the intermediate `analytics/` prefix segment.
- **System Impact:** 🔴 CRITICAL — Dashboard stat cards (`users`, `posts`, `jobs`, `events`) and entire Analytics page failed to load with 404 on every page visit.
- **Resolution / Fix:**
  Updated both Web App Axios call sites to include the controller prefix:
  - `web/src/pages/Dashboard/Dashboard.tsx:32` → `/api/v1/analytics-service/analytics/overview`
  - `web/src/pages/Analytics/Analytics.tsx:33` → `/api/v1/analytics-service/analytics/overview`

  Full routing path after fix:
  `GET /api/v1/analytics-service/analytics/overview` → ingress strips prefix → `GET /api/v1/analytics/overview` → `@Controller('analytics')` + `@Get('overview')` ✅

- **Tested:** ✅ Passed — 2026-03-08 via `test_issue8.js` (11/11 assertions passed)
  - Test A: `GET /analytics-service/analytics/overview` → **200 OK** — ingress correctly forwards to `@Controller('analytics')`
  - Test B: `GET /analytics-service/overview` (old wrong path) → **404** — bare `/overview` path is unregistered
  - Test C: Response shape `{ users:1, posts:46, jobs:0, events:0 }` — all fields present and numeric ✅
  - Test D: `res.data` directly satisfies `StatData` interface — Dashboard stat cards bind correctly
  - Test E: `GET /analytics/posts` → **200 OK** — popular posts aggregation returns array
  - Test F: `GET /analytics/jobs` → **200 OK** — job application counts aggregation returns array
  - Test G: `GET /analytics/users` → **200 OK** — user registrations time-series returns array
  - Test H: `GET /analytics/latencies` with admin token → **200 OK** — RolesGuard passes; student token → **403** RBAC enforced
- **Note:** `events=0` in the overview response is a known separate issue (Issue 34 — running `v3` pod uses `collection('events')` but actual MongoDB collection is `evententities'`). This does not affect URL routing correctness.

### 9. Web App → Research Service: Wrong URL path
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** React Web App (`Research.tsx`), Kubernetes NGINX Ingress, Research Service
- **Context / When it Happens:** When loading the Research page (project list, create, update, upload, delete).
- **Error Signature:** HTTP `404 Not Found`; and separately, `400 Bad Request` on document upload.
- **Root Cause (two-part):**
  1. **URL path mismatch (original Issue 9):** Web app was calling `GET /api/v1/research-service/projects`. After ingress rewrite (`rewrite-target: /api/v1/$2`), this became `GET /api/v1/projects`. The Research controller uses `@Controller('research')`, so the actual endpoint is `GET /api/v1/research`. The frontend was using the wrong path segment `projects` instead of `research`.
  2. **Multipart field name mismatch (discovered during test):** `Research.tsx:92` was calling `formData.append('document', file)`. The backend `FileInterceptor('file')` ignores any field not named `file`, so `req.file` was always `undefined`, causing a `400 Bad Request` (`"A file attachment is required"`) on every document upload from the web app.
- **System Impact:** 🔴 CRITICAL — (1) Entire Research page blank on load; all CRUD operations fail with 404. (2) Document upload always fails with 400 regardless of what file is selected.
- **Resolution / Fix:**

  **Fix 1 — URL routing** (applied in initial Issue 1 sweep):
  Updated all Axios call sites in `web/src/pages/Research/Research.tsx` to use the correct controller-aligned path:
  - `GET /api/v1/research-service/research` (list all projects)
  - `POST /api/v1/research-service/research` (create project)
  - `GET /api/v1/research-service/research/:id` (get project)
  - `PATCH /api/v1/research-service/research/:id` (update project)
  - `POST /api/v1/research-service/research/:id/invite` (invite collaborator)
  - `POST /api/v1/research-service/research/:id/documents` (upload document)
  - `DELETE /api/v1/research-service/research/:id` (delete project)

  Full routing chain: `/api/v1/research-service/research` → ingress strips prefix → `/api/v1/research` → `@Controller('research')` ✅

  **Fix 2 — Multipart field name** (`web/src/pages/Research/Research.tsx:92`):
  ```typescript
  // Before:
  formData.append('document', file);
  // After:
  formData.append('file', file);
  ```
  This aligns with `FileInterceptor('file')` in `research.controller.ts`.

- **Tested:** ✅ Passed — 2026-03-08 via `test_issue9.js` (9/9 assertions passed)
  - Test A: `GET /research-service/research` → **200 OK** — array of 17 projects returned
  - Test B: `GET /research-service/projects` (old wrong path) → **404** — unregistered path
  - Test C: `POST /research-service/research` → **201 Created** — project created with UUID `ownerId`
  - Test D: `GET /research-service/research/:id` → **200 OK** — project returned by ID
  - Test E: `PATCH /research-service/research/:id` → **200 OK** — description updated
  - Test F: `POST /:id/documents` with field=`document` → **400** — confirms frontend bug; backend validates field name
  - Test G: `POST /:id/documents` with field=`file` → **201 Created** — document stored in MinIO, metadata in MongoDB  
  - Test H: `GET /research-service/research` without token → **401** — `JwtAuthGuard` enforced
  - Test I: `DELETE /research-service/research/:id` → **200 OK** — project deleted (cleanup)

### 10. Notification Service: Missing GET /count endpoint
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Notification Service (`notifications.controller.ts`, `notifications.service.ts`), React Web App Topbar
- **Context / When it Happens:** Web App Topbar polls `GET /api/v1/notification-service/notifications/count` every 30 seconds to show the unread notification badge count.
- **Error Signature:** HTTP `404 Not Found` on every poll — the notification badge is permanently 0 regardless of actual unread messages.
- **Root Cause:** The original `notifications.controller.ts` only had three routes: `GET /` (inbox list), `PATCH /:id/read`, and `PATCH /read-all`. The `/count` route was never registered. Every Topbar poll hit a 404 which was silently swallowed, defaulting the badge to 0.
- **System Impact:** 🟡 MEDIUM — Notification badge in topbar is always 0. Users have no indication of unread notifications.
- **Resolution / Fix:**

  **`services/notification-service/src/notifications/notifications.service.ts`** — Added `countUnread()` method:
  ```typescript
  async countUnread(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ userId, read: false });
  }
  ```

  **`services/notification-service/src/notifications/notifications.controller.ts`** — Added `@Get('count')` endpoint:
  ```typescript
  /** GET unread notification count */
  @Get('count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationsService.countUnread(req.user.sub);
    return { count };
  }
  ```

  The `userId` is a Keycloak UUID string — `countDocuments({ userId, read: false })` uses plain string comparison so there is no BSON CastError. Fix deployed in `notification-service:v7`.
  *(This issue is identical to Issue 27 — both document the same missing `/count` endpoint. See Issue 27 for the full per-service audit entry.)*

- **Tested:** ✅ Covered by Issue 5 — 2026-03-08 via `test_issue5.js` Test E
  - `GET /api/v1/notification-service/notifications/count` with student Keycloak JWT → **200 OK**, `{ count: N }` returned
  - `res.data.count` is a number (not undefined, no BSONError crash)
  - Running `notification-service:v7` pod confirmed live: `grep -c "countUnread|count" /app/dist/notifications/notifications.controller.js` → **3 matches**
  - No separate test script required — Issue 5 Test E directly verifies this endpoint.

### 11. Empty UI Components Directory
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** React Web App (`web/src/components/ui/`)
- **Context / When it Happens:** Codebase architecture review.
- **Error Signature:** N/A (Structural issue)
- **Root Cause:** Phase 9.2 plan called for a full shared component library (cards, badges, buttons, modals, etc.). The `ui/` folder was created but never populated. All pages implemented UI elements inline, leading to duplicated styles and inconsistent component behaviour.
- **System Impact:** 🟡 MEDIUM — Pages implement UI inline without shared components, leading to code duplication, inconsistency, and poor reusability.
- **Resolution / Fix:** The component library has been scaffolded with three production-ready components:

  **`web/src/components/ui/Button.tsx`** — variant (`primary`/`secondary`/`outline`/`ghost`/`danger`), size (`sm`/`md`/`lg`), `isLoading` spinner state, full `ButtonHTMLAttributes` passthrough via `forwardRef`.

  **`web/src/components/ui/Card.tsx`** — generic container with optional `noPadding` prop, full `HTMLAttributes<HTMLDivElement>` passthrough via `forwardRef`.

  **`web/src/components/ui/Badge.tsx`** — variant (`success`/`warning`/`danger`/`info`/`default`), full `HTMLAttributes<HTMLSpanElement>` passthrough via `forwardRef`.

  **`web/src/components/ui/ui.css`** — shared stylesheet for all three components.

  All components use `clsx` (v2.1.1, listed in `web/package.json`) for conditional class merging.

  **Integration gap (noted, not blocking):** No page currently imports from `components/ui/`. Pages continue to use inline JSX for UI elements. Migrating existing pages to the shared library is a future integration effort separate from this scaffolding issue.

- **Tested:** ✅ Passed — 2026-03-08 via `test_issue11.js` (37/37 assertions passed)
  - Test A: All 4 files exist — `Button.tsx`, `Card.tsx`, `Badge.tsx`, `ui.css` ✅
  - Test B: `Button.tsx` — exports `Button` with variant/size/isLoading props and `forwardRef`, `Button.displayName` set ✅
  - Test C: `Card.tsx` — exports `Card` with `noPadding` prop and `forwardRef`, `Card.displayName` set ✅
  - Test D: `Badge.tsx` — exports `Badge` with success/warning/danger/info variant enum and `forwardRef` ✅
  - Test E: All 3 TSX files import and call `clsx()` ✅
  - Test F: `clsx@^2.1.1` confirmed in `web/package.json` dependencies ✅
  - Test G: `npx tsc --noEmit -p tsconfig.app.json` — UI component files pass with zero TypeScript errors ✅

### 12. Empty Hooks Directory
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** React Web App (`web/src/hooks/`)
- **Context / When it Happens:** Codebase architecture review.
- **Error Signature:** N/A
- **Root Cause:** The `hooks/` folder was created as part of the planned architecture but no custom React hooks were implemented. Pages handled state and auth access inline.
- **System Impact:** 🟢 LOW — Minor architectural issue. Pages handle state inline currently.
- **Resolution / Fix:** Two custom hooks implemented:

  **`web/src/hooks/useAuth.ts`** — wraps `AuthContext` with a guard that throws if used outside `AuthProvider`, providing type-safe access to auth state:
  ```typescript
  export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
  };
  ```

  **`web/src/hooks/useFetch.ts`** — generic data-fetching hook backed by the shared Axios instance, returns `{ data, loading, error, refetch }`:
  ```typescript
  export function useFetch<T>(url: string, options?: AxiosRequestConfig): UseFetchResult<T>
  ```

  **Integration gap (noted, not blocking):** Pages currently import `useAuth` directly from `contexts/AuthContext` (which also exports its own `useAuth`). Both imports are functionally equivalent. `useFetch` is defined but not yet used by any page.

- **Tested:** ✅ Passed — 2026-03-08 via `test_issue12.js` (26/26 assertions passed)
  - Test A: Both files exist — `useAuth.ts`, `useFetch.ts`; `hooks/` directory non-empty ✅
  - Test B: `useAuth.ts` — imports `useContext` and `AuthContext`, exports `useAuth`, calls `useContext(AuthContext)`, throws `Error` if outside `AuthProvider`, returns context ✅
  - Test C: `useFetch.ts` — exports generic `useFetch<T>`, returns `{ data, loading, error, refetch }`, `UseFetchResult<T>` interface defined ✅
  - Test D: `useFetch.ts` — imports axios (`api`), uses `useCallback` memoization, `useState`, `useEffect` ✅
  - Test E: `AuthContext.tsx` still exports `useAuth` and `AuthContext` — backward compatibility intact ✅
  - Test F: `npx tsc --noEmit -p tsconfig.app.json` — hook files pass with zero TypeScript errors ✅
  **Note:** Three TypeScript errors were found and fixed during this test run:
  1. `AuthContext.tsx` — `AuthContext` was declared but not exported; changed `const AuthContext` → `export const AuthContext`
  2. `useFetch.ts` — used default import `import api from '../lib/axios'` but `lib/axios.ts` only has named export `export const api`; fixed to `import { api } from '../lib/axios'`
  3. `useFetch.ts` — `AxiosRequestConfig` and `AxiosError` are type-only imports; changed to `import type { AxiosRequestConfig, AxiosError } from 'axios'` to comply with `verbatimModuleSyntax: true` in `tsconfig.app.json`

### 13. Messaging Service Has No Health Endpoint
- **Date Logged:** 2026-03-08
- **Component(s) Affected:** Messaging Service, InfraStatus Web App Page
- **Context / When it Happens:** InfraStatus page pings all services' health endpoints.
- **Error Signature:** HTTP `404 Not Found` on `GET /api/v1/messaging-service/health`.
- **Root Cause:** The `messaging-service` was scaffolded but lacks a `health/` module, `auth/` module, and `metrics/` module.
- **System Impact:** 🟡 MEDIUM - The service appears "down" on the InfraStatus page ping list.
- **Resolution / Fix:** Future Implementation.

### 14. CI/CD uses `npm ci` but `package-lock.json` is missing
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `.github/workflows/ci-cd.yml`, root `package-lock.json`
- **Context / When it Happens:** On every push to `main` or pull request, the GitHub Actions `lint-and-test` job fails immediately at the `Install dependencies` step for all 8 services in the matrix.
- **Error Signature:** `npm error: The `npm ci` command can only install with an existing package-lock.json` — pipeline exits with code 1 before any lint or test can run.
- **Root Cause (two-part):**
  1. `run: npm ci` requires a `package-lock.json` to exist. No root or per-service `package-lock.json` was committed to the repository, so every CI run failed immediately.
  2. A secondary problem: `cache-dependency-path: services/${{ matrix.service }}/package.json` was wrong for an npm workspaces monorepo. The GitHub Actions npm cache uses this path to generate the cache key; pointing it at individual service `package.json` files (not the root `package-lock.json`) meant (a) the cache key was wrong and (b) the cache would never be valid because per-service lock files don't exist in a workspace setup.
- **System Impact:** 🟡 MEDIUM — The entire CI/CD lint-and-test job fails on every push. No linting, no tests, no Docker builds, no deployments can proceed.
- **Resolution / Fix (correct — not the `npm install` shortcut):**
  The root `package-lock.json` was generated (`npm install` at workspace root produces `package-lock.json` lockfileVersion 3 covering all 8 services and the web/mobile workspaces — 955 package entries total). With the lock file present, `npm ci` is restored as the proper install command:

  **`.github/workflows/ci-cd.yml` — `lint-and-test` job:**
  ```yaml
  - name: Setup Node.js
    uses: actions/setup-node@v4
    with:
      node-version: "20"
      cache: "npm"
      cache-dependency-path: package-lock.json   # ← fixed: root lock file

  - name: Install dependencies
    run: npm ci                                   # ← restored: reproducible install
  ```
  Two changes applied:
  - `cache-dependency-path` changed from `services/${{ matrix.service }}/package.json` → `package-lock.json` (root). This is the correct key for a monorepo npm workspace.
  - `npm install` → `npm ci` (the proper CI command: fails if lock file is missing or out of sync, does not modify the lock file, faster on clean installs).
- **Test:** `test_issue14.js` — 11/11 passed (lock file exists, lockfileVersion 3, 955 packages, all 8 services in lock, no per-service lock files, `npm ci --dry-run` succeeds, YAML uses `npm ci`, `cache-dependency-path: package-lock.json`) 2026-03-08

### 15. Analytics Service HPA CPU threshold inconsistency
- **Date Logged:** 2026-03-08
- **Component(s) Affected:** Kubernetes HPA config for Analytics Service
- **Context / When it Happens:** Traffic load scaling.
- **Error Signature:** Analytics service scales much later than other microservices.
- **Root Cause:** The HPA configuration for `analytics-service` uses `averageUtilization: 70`, whereas all other 7 microservices use `averageUtilization: 30`.
- **System Impact:** 🟢 LOW - Unintentional scaling delay for the analytics service under load.
- **Resolution / Fix:** Pending. Update `analytics-service` HPA configuration to match the 30% baseline.

---

## 🛑 Full Per-Service Audit Report (Manual Scan Part 2)

### 16. User Service: `upsertFromKeycloak()` is never called — Full Investigation & Resolution
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** User Service (`jwt.strategy.ts`, `users.controller.ts`, `users.service.ts`), Mongoose schema, test infrastructure (`test_issue16_4.js`, `setup_temp_users.sh`)
- **Context / When it Happens:** Any first request from a Keycloak-authenticated user to `GET /api/v1/user-service/users/me`.
- **Error Signature:**
  - First symptom: `GET /me` → `404 Not Found`
  - After partial fix attempt (adding upsert call to `getMe()`): `GET /me` → `500 Internal Server Error`
  - Root cause 500 log: `ValidationError: users validation failed: email: Path 'email' is required.`
- **Root Cause (full chain):**
  1. **`upsertFromKeycloak()` was never wired into the request lifecycle.** The method existed in `users.service.ts` but nothing called it during authentication. `getMe()` only ran `findOne({ keycloakId })` and threw a 404 when no document existed.
  2. **JWT strategy read non-existent Keycloak claims.** Once `upsertFromKeycloak()` was wired into `getMe()`, the 404 became a 500. The `validate()` method in `jwt.strategy.ts` read `payload.name` and `payload.email` directly. Keycloak's default JWT payload does not include a `name` field — it uses `given_name`, `family_name`, and `preferred_username`. It may also omit `email` on some realm configurations. Both values were `undefined`, so calling `upsertFromKeycloak({ email: undefined })` triggered a Mongoose `ValidationError` (email is `required: true`), crashing the request with a 500 before any document was created.
  3. **Duplicate email on upsert after test teardown.** `cleanup()` in `setup_temp_users.sh` deleted Keycloak users but left the corresponding MongoDB documents in place. On the next test run, Keycloak created a new user with the same email address (but a new UUID `sub`). The upsert filter `{ keycloakId: dto.keycloakId }` did not match the stale MongoDB document (different UUID), so Mongoose attempted an INSERT, which hit the `email` unique index and crashed with a duplicate-key 500.
- **System Impact:** 🔴 CRITICAL — New users were permanently blocked from accessing their profile, and many downstream service calls (e.g., creating posts, joining events) that looked up user profiles also failed silently.
- **Resolution / Fix (all applied — fully resolved):**

  **Fix 1 — `services/user-service/src/auth/strategies/jwt.strategy.ts`**
  Added a full claim-extraction fallback chain in `validate()`:
  ```typescript
  const name =
    payload.name ||
    [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
    payload.preferred_username ||
    'Unknown User';
  const email =
    payload.email ||
    payload.preferred_username ||
    `${payload.sub}@keycloak.local`;
  ```
  This guarantees `req.user.name` and `req.user.email` are always defined non-empty strings, regardless of Keycloak realm token configuration.

  **Fix 2 — `services/user-service/src/users/users.service.ts`**
  Changed the upsert filter from a single-field match to a `$or` match to handle user re-creation scenarios:
  ```typescript
  // Before:
  findOneAndUpdate({ keycloakId: dto.keycloakId }, { $set: dto }, { upsert: true, new: true })

  // After:
  findOneAndUpdate(
    { $or: [{ keycloakId: dto.keycloakId }, { email: dto.email }] },
    { $set: dto },
    { upsert: true, new: true }
  )
  ```
  Also added `findMe(keycloakId)` method that returns `null` (not throws) when no document exists, so the controller can branch cleanly.

  **Fix 3 — `services/user-service/src/users/users.controller.ts`**
  Rewired `getMe()` to use the null-safe `findMe()` then auto-provision on first login:
  ```typescript
  @Get('me')
  async getMe(@Request() req) {
    const existing = await this.usersService.findMe(req.user.sub);
    if (existing) return existing;
    return this.usersService.upsertFromKeycloak({
      keycloakId: req.user.sub,
      email: req.user.email || `${req.user.sub}@keycloak.local`,
      name: req.user.name || 'Unknown User',
      role: req.user.role || 'student',
    });
  }
  ```
  Removed stale debug `console.log` statements left from prior partial fix attempt.

  **Fix 4 — `setup_temp_users.sh`** (test infrastructure)
  Added MongoDB purge step to `cleanup()` so that test teardown removes both the Keycloak user AND the corresponding MongoDB document, preventing the duplicate-email collision on re-runs:
  ```bash
  kubectl exec -n miniproject statefulset/mongodb -- mongosh miniproject_db --quiet \
    --eval 'db.users.deleteMany({email:{$in:["student@test.com","admin@test.com"]}})' 2>/dev/null
  ```

  **Deployment note:** After applying code changes, the Kubernetes pods must be rebuilt with the Docker image built directly inside Minikube's Docker daemon. `minikube image load` silently ignores already-cached same-tag images. See Issue 40 for the correct rebuild procedure.

- **Verification:** `test_issue16_4.js` E2E test passes — `GET /me` returns 200 on first login with correct `name`, `email`, `role`, and `keycloakId`. Subsequent calls return 200 idempotently (no duplicate insert). See Testing Tracker entry for full test output.

### 17. User Service: `findById(id)` raw string mapping error
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** User Service (`users.service.ts`), `GET /api/v1/user-service/users/:id` (admin-only)
- **Context / When it Happens:** Calling `GET /users/:id` with any string that is not a valid 24-character hex MongoDB ObjectId — e.g. a Keycloak UUID (`9d6b...`) or arbitrary garbage.
- **Error Signature:** `HTTP 500 Internal Server Error` — Mongoose throws `BSONError: input must be a 24 character hex string` before even reaching the database.
- **Root Cause:** Mongoose's `findById()` attempts to cast the raw string to `ObjectId` internally before issuing the query. If the string is not a valid 24-char hex value, the cast throws a `CastError` / `BSONError` that propagates as an unhandled 500. No format check was present before the `findById()` call.
- **System Impact:** 🟡 MEDIUM — Any admin lookup using a Keycloak UUID or malformed ID crashes with a hard 500 instead of a clean 400. Also caused confusing 500s when other services cross-referenced users by their Keycloak sub rather than MongoDB `_id`.
- **Resolution / Fix:**

  **`services/user-service/src/users/users.service.ts` — `findById()` method:**

  Added a pre-query ObjectId format guard using `Types.ObjectId.isValid(id)`. If the string fails the check, a `BadRequestException` (400) is thrown immediately — Mongoose never receives the invalid value, so no `CastError` is possible:
  ```typescript
  async findById(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
  ```
  Also removed 3 leftover debug `console.log` statements (`[SERVICE] findById called with id:`, `throwing BadRequest`, `throwing 404`) that were left from a development investigation and should not be in production code.

  **Error response matrix (after fix):**
  | Input | `isValid()` | DB query | Response |
  |---|---|---|---|
  | Valid 24-char hex ObjectId, exists in DB | ✅ true | returns doc | **200 OK** |
  | Valid 24-char hex ObjectId, NOT in DB | ✅ true | returns null | **404 NotFoundException** |
  | Keycloak UUID (`9d6b...-...`) | ❌ false | skipped | **400 BadRequest** |
  | Garbage string (`not-an-id`) | ❌ false | skipped | **400 BadRequest** |

- **Tested:** ✅ Passed — 2026-03-08 via `test_issue17.js` (10/10 assertions passed)
  - Pre-flight: `GET /users/me` as admin → resolved MongoDB `_id` (`69ad615b...`) and `keycloakId` (Keycloak UUID)
  - Test A: `GET /users/69ad615b67bc77d4f5f3085c` (valid ObjectId, existing) → **200 OK**, doc `_id` and `keycloakId` match ✅
  - Test B: `GET /users/595cb0cc-eaa1-404c-8012-793a88a66734` (Keycloak UUID, invalid ObjectId) → **400 BadRequest** (NOT 500 CastError) ✅
  - Test C: `GET /users/not-an-id` (garbage string) → **400 BadRequest** (NOT 500 CastError) ✅
  - Test D: `GET /users/507f1f77bcf86cd799439011` (valid format, not in DB) → **404 NotFoundException** (NOT 500) ✅
  - Test E: `GET /users/:id` with student token → **403 Forbidden** — `RolesGuard(ADMIN)` correctly enforced ✅

### 18. Feed Service: Web App integration URL mismatch
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Feed Service, Web App (`Dashboard.tsx`)
- **Context / When it Happens:** Fetching feed on Dashboard.
- **Error Signature:** 404 Not Found.
- **Root Cause:** Controller path is `@Controller('feed')` → actual endpoint `GET /api/v1/feed`. Web app calls `/api/v1/feed-service/posts` → rewrites to `GET /api/v1/posts`.
- **System Impact:** 🔴 CRITICAL - Feed fails to load completely.
- **Resolution / Fix:** `Dashboard.tsx:40` updated to `GET /api/v1/feed-service/feed?page=1&limit=3`, aligning with `@Controller('feed')`. Fix was applied as part of the Issue 6 / Issue 1 initial URL sweep.
- **Tested:** ✅ Covered by Issue 6 — 2026-03-08 via `test_issue6.js` Test D
  - `GET /api/v1/feed-service/feed?page=1&limit=3` (Dashboard widget call) → **200 OK** with `{ items[], meta }` envelope
  - Current `Dashboard.tsx:40` uses the correct path — no old `/posts` reference remains anywhere in the codebase
  - This issue is a subset of Issue 6; both share the same root cause and the same fix. No separate test script required.

### 19. Feed Service: Envelope wrapper mismatch on `getFeed()`
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Feed Service (`feed.service.ts`), Web App (`Feed.tsx`, `Dashboard.tsx`)
- **Context / When it Happens:** Successful feed fetch response.
- **Error Signature:** Display is empty, pagination breaks.
- **Root Cause:** Backend `getFeed()` was returning a raw `PostDocument[]` array. The Web app explicitly destructures `res.data.items` and `res.data.meta.totalPages` — both `undefined` on a raw array — causing blank feed rendering and broken pagination.
- **System Impact:** 🔴 CRITICAL - Posts do not render; pagination is completely broken.
- **Resolution / Fix:** `getFeed()` in `services/feed-service/src/feed/feed.service.ts` now returns the `{ items, meta }` envelope:
  ```typescript
  const result = { items, meta: { totalPages, page } };
  await this.redis.set(cacheKey, JSON.stringify(result), FEED_CACHE_TTL);
  return result;
  ```
  This fix was implemented as part of the Issue 7 resolution and deployed in `feed-service:v9`.
- **Tested:** ✅ Covered by Issue 7 — 2026-03-08 via `test_issue7.js`
  - Test A: `GET /feed?page=1&limit=10` → body is object `{ items[], meta{} }` NOT a raw array
  - Test C: `meta.totalPages` and `meta.page` present and correct
  - Test G: Regression — response root is object envelope, NOT raw array
  - Running `feed-service:v9` pod confirmed to have envelope wrapper compiled in (`grep meta.*totalPages` → 1 match)

### 20. Feed Service: Missing query filter support in `getFeed()`
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Feed Service (`feed.service.ts`, `feed.controller.ts`), React Web App (`Feed.tsx`)
- **Context / When it Happens:** Clicking filter tabs on the frontend (student, alumni, staff) to show only posts from users of a given role.
- **Error Signature:** All role filter tabs return the same full unfiltered list — selecting "student" still shows alumni and staff posts.
- **Root Cause:** The original `getFeed()` implementation did not accept a `role` query parameter, so `feed.controller.ts` had no way to pass a role filter into the MongoDB query. All queries ran against an empty `filter = {}`, returning all posts regardless of the `?role=` query string sent by the frontend.
- **System Impact:** 🟡 MEDIUM — Role-based feed filtering tabs on the frontend have no effect. Users cannot narrow the feed to posts relevant to their interest.
- **Resolution / Fix:** Fix was implemented as part of the Issue 7 resolution and deployed in `feed-service:v9`:

  **`services/feed-service/src/feed/feed.controller.ts`** — reads `query.role` and passes it to the service:
  ```typescript
  const role = query.role;
  return this.feedService.getFeed(page, limit, role);
  ```

  **`services/feed-service/src/feed/feed.service.ts`** — applies role to the MongoDB filter and includes it in the Redis cache key:
  ```typescript
  const cacheKey = `feed:page:${page}:limit:${limit}:role:${role || 'all'}`;
  const filter: Record<string, any> = {};
  if (role) {
    filter.authorRole = role;
  }
  ```

- **Tested:** ✅ Covered by Issue 7 — 2026-03-08 via `test_issue7.js` Test E
  - `GET /api/v1/feed-service/feed?page=1&limit=10&role=student` → **200 OK**, all returned posts have `authorRole=student`
  - Running `feed-service:v9` pod confirmed live: `grep -c "authorRole" /app/dist/feed/feed.service.js` → **2 matches**; `grep -c "query.role" /app/dist/feed/feed.controller.js` → **1 match**
  - This issue is a subset of Issue 7; both share the same root cause and the same fix. No separate test script required.

### 21. Feed Service: `MulterModule` Default Implicit Storage
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Feed Service (`feed.module.ts`, `feed.controller.ts`)
- **Context / When it Happens:** `POST /api/v1/feed-service/feed` with a multipart file attachment (image upload).
- **Error Signature:** `TypeError: Cannot read properties of undefined (reading 'buffer')` — `file.buffer` is `undefined` when Multer defaults to disk storage.
- **Root Cause:** `MulterModule` was not registered in `FeedModule`, so `FileInterceptor` fell back to Multer's implicit default storage (disk). With disk storage, `file.buffer` is not populated — only `file.path` is set. Any code referencing `file.buffer` silently receives `undefined` or crashes.
- **System Impact:** 🟢 LOW — File upload appears to succeed (201 response) but the buffer is empty. Silent failure on subsequent MinIO/storage operations.
- **Resolution / Fix:** Explicitly registered `MulterModule` with `memoryStorage()` in `FeedModule`:
  ```typescript
  MulterModule.register({ storage: memoryStorage() })
  ```
  This ensures `file.buffer` is always populated for uploads processed by `FileInterceptor`.
- **Test:** `test_issue21.js` — 8/8 passed (file upload 201, buffer non-empty, `file.mimetype` correct, multer config confirmed in module) 2026-03-08

### 22. Job Service: No Duplicate-Application Guard
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Job Service (`schemas/application.schema.ts`, `schemas/job.schema.ts`, `jobs.service.ts`)
- **Context / When it Happens:** User calls `POST /api/v1/job-service/jobs/:id/apply` more than once for the same job, or any apply call where the applicant is a Keycloak user.
- **Error Signature:** Multiple identical `Application` documents created silently. Also: `BSONError: input must be a 24 character hex string` when `applicantId` was `Types.ObjectId` and a Keycloak UUID was passed.
- **Root Cause:** `ApplicationSchema` had no unique constraint on `{ jobId, applicantId }`. `applicantId` and `postedBy` were typed as `Types.ObjectId` — Keycloak UUIDs are not valid 24-char hex ObjectIds, causing a BSONError crash on every apply attempt.
- **System Impact:** 🟡 MEDIUM — Duplicate applications pollute the database; owners see inflated false applicant counts.
- **Resolution / Fix:**
  - `application.schema.ts`: Changed `applicantId` to `type: String` (removes ObjectId cast, accepts Keycloak UUIDs). Added compound unique index: `ApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true })`.
  - `job.schema.ts`: Changed `postedBy` to `type: String`.
  - `jobs.service.ts`: Removed `new Types.ObjectId(applicantId)` cast; added `ConflictException` catch for `err.code === 11000`:
    ```typescript
    } catch (err: any) {
      if (err.code === 11000) throw new ConflictException('You have already applied to this job');
      throw err;
    }
    ```
  Pod rebuilt to `job-service:v2`.
- **Test:** `test_issue22_23.js` — 13/13 passed (409 on duplicate apply, 201 on first apply, no BSONError) 2026-03-08

### 23. Job Service: `withRetry()` Deterministic Delay
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Job Service (`jobs.service.ts`)
- **Context / When it Happens:** Submitting a duplicate job application or invalid data that triggers `ValidationError`, `CastError`, or `MongoServerError code 11000`.
- **Error Signature:** API takes 3+ seconds to return an error response (3 retry cycles × ~1s delay each) instead of returning immediately.
- **Root Cause:** `withRetry()` generically wrapped `appModel.create()` and retried on ALL errors. Deterministic errors (`ValidationError`, `CastError`, duplicate key `11000`) will never succeed on retry — they are determined by input data, not transient conditions. Each retry added a 1-second exponential backoff delay before inevitably failing.
- **System Impact:** 🟢 LOW — Slower UX for intentionally bad requests; wastes server cycles on guaranteed-to-fail retries.
- **Resolution / Fix:** Added deterministic error detection in `withRetry()` to skip retries for non-transient errors:
  ```typescript
  if (
    err instanceof mongoose.Error.ValidationError ||
    err instanceof mongoose.Error.CastError ||
    (err as any).code === 11000
  ) {
    throw err; // deterministic — retrying won't help
  }
  ```
  Only transient errors (network timeouts, connection resets) now trigger the exponential backoff loop.
- **Test:** `test_issue22_23.js` — 13/13 passed (duplicate apply returned conflict in <50ms confirming no retry delay) 2026-03-08

### 24. Event Service: Missing `GET /:id` Endpoint
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Event Service (`events.controller.ts`, `events.service.ts`, `schemas/event.schema.ts`)
- **Context / When it Happens:** `GET /api/v1/event-service/events/:id` to view a specific event's details; also `POST /events` and `POST /events/:id/rsvp` with Keycloak users.
- **Error Signature:** HTTP `404 Not Found` — NestJS "route not found" (path not registered). Also: `BSONError: input must be a 24 character hex string` when `createdBy` and `rsvps` were `Types.ObjectId` and Keycloak UUIDs were passed.
- **Root Cause:** `events.controller.ts` lacked the `@Get(':id')` route binding entirely. `event.schema.ts` defined `createdBy: Types.ObjectId` and `rsvps: [Types.ObjectId]` — Keycloak UUIDs are not valid 24-char hex ObjectIds, causing BSONError crashes on create and RSVP.
- **System Impact:** 🔴 HIGH — Event detail pages return 404; event creation and RSVP with Keycloak users crash with 500.
- **Resolution / Fix:**
  - `events.controller.ts`: Added `@Get(':id')` route bound to `findById()`.
  - `event.schema.ts`: Changed `createdBy` to `type: String` and `rsvps` to `[String]` — accepts Keycloak UUIDs directly.
  - `events.service.ts`: Removed `new Types.ObjectId(createdBy)` and `new Types.ObjectId(userId)` casts; kept `Types.ObjectId.isValid(id)` guard for format check.
  Pod rebuilt to `event-service:v2`.
- **Test:** `test_issue24_25_26.js` — 16/16 passed (GET /:id returns 200, create with UUID 201, no BSONError) 2026-03-08

### 25. Event Service: Mongoose `findById()` CastError String
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Event Service (`events.service.ts`)
- **Context / When it Happens:** `GET /api/v1/event-service/events/:id` with a non-ObjectId string (e.g. `not-a-valid-id`, a Keycloak UUID).
- **Error Signature:** HTTP `500 Internal Server Error` — `CastError: Cast to ObjectId failed for value "..." at path "_id"`.
- **Root Cause:** Mongoose's `findById()` internally casts the provided string to `ObjectId` before querying. When the string is not a valid 24-char hex ObjectId, Mongoose throws a `CastError` that propagates as an unhandled 500.
- **System Impact:** 🟡 MEDIUM — Invalid IDs crash with 500 instead of returning a clean 400 or 404.
- **Resolution / Fix:** Added `Types.ObjectId.isValid(id)` pre-query guard in `findById()`:
  ```typescript
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundException(`Event ${id} not found`);
  }
  ```
  Invalid strings now return 404 cleanly without touching Mongoose.
- **Test:** `test_issue24_25_26.js` — 16/16 passed (invalid ObjectId → 404 not 500, valid format but missing → 404) 2026-03-08

### 26. Event Service: Race Condition Typing on `rsvp()`
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Event Service (`events.service.ts`)
- **Context / When it Happens:** `POST /api/v1/event-service/events/:id/rsvp` when the event is deleted between the initial `findById()` guard and the subsequent `findByIdAndUpdate()` call.
- **Error Signature:** `TypeError: Cannot read properties of null` — `updated` is `null` and the code attempts to access properties on it, crashing with an unhandled 500.
- **Root Cause:** `rsvp()` first calls `findById()` (existence check), then calls `findByIdAndUpdate()`. Between these two calls, if the event is concurrently deleted, `findByIdAndUpdate()` returns `null`. The code assumed it would always return a document and did not null-check the result.
- **System Impact:** 🟡 MEDIUM — Race condition (delete-during-RSVP) produces an unhandled 500 crash instead of a clean 404.
- **Resolution / Fix:** Added explicit null check after `findByIdAndUpdate()`:
  ```typescript
  if (!updated) {
    throw new NotFoundException('Event not found or was deleted during RSVP');
  }
  ```
- **Test:** `test_issue24_25_26.js` — 16/16 passed (RSVP returns 200 with UUID in rsvps[], idempotent $addToSet, null-guard confirmed in source) 2026-03-08

### 27. Notification Service: Missing `GET /notifications/count` Endpoint
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Notification Service (`notifications.controller.ts`, `notifications.service.ts`), React Web App Topbar
- **Context / When it Happens:** Web App Topbar polls `GET /api/v1/notification-service/notifications/count` every 30 seconds to show the unread badge count.
- **Error Signature:** HTTP `404 Not Found` on every poll — notification badge is permanently 0 regardless of actual unread messages.
- **Root Cause:** The original `notifications.controller.ts` only had three routes: `GET /` (inbox list), `PATCH /:id/read`, and `PATCH /read-all`. The `/count` route was not registered, so every Topbar poll hit a 404. Since the Topbar silently swallows errors and defaults to 0, users had no visible indication that the endpoint was missing.
- **System Impact:** 🔴 CRITICAL — Visual notification badge is permanently broken. Users never see unread notification counts, making the notification system functionally invisible.
- **Resolution / Fix:**

  **`services/notification-service/src/notifications/notifications.service.ts`** — Added `countUnread()` method:
  ```typescript
  async countUnread(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ userId, read: false });
  }
  ```

  **`services/notification-service/src/notifications/notifications.controller.ts`** — Added `@Get('count')` endpoint:
  ```typescript
  /** GET unread notification count */
  @Get('count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationsService.countUnread(req.user.sub);
    return { count };
  }
  ```

  The `userId` is a Keycloak UUID string — `countDocuments({ userId, read: false })` uses plain string comparison and does not invoke `new ObjectId()`, so there is no BSON CastError. This fix was deployed in the running `notification-service:v7` image.

- **Tested:** ✅ Covered by Issue 5 — 2026-03-08 via `test_issue5.js` Test E
  - `GET /api/v1/notification-service/notifications/count` with student Keycloak JWT → **200 OK**, `{ count: N }` returned
  - `res.data.count` is a number (not undefined, no BSONError crash)
  - Running `notification-service:v7` pod confirmed live: `grep -c "countUnread|count" /app/dist/notifications/notifications.controller.js` → **3 matches**
  - This issue is a subset of Issue 5; the fix was bundled with the UUID BSON refactor and the endpoint has been live since `v7`. No separate test script required.

### 28. Notification Service: Silent Null on `markRead`
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Notification Service (`notifications.service.ts`)
- **Context / When it Happens:** `PATCH /api/v1/notification-service/notifications/:id/read` with a notification ID that does not exist or belongs to a different user.
- **Error Signature:** HTTP `200 OK` with `null` response body — no indication of failure.
- **Root Cause:** `findOneAndUpdate({ _id: notificationId, userId: userId }, ...)` returns `null` when (a) the notification ID does not exist, or (b) the authenticated user is not the owner. Without a null check, `markRead()` returned `null` silently, and the controller forwarded it as a 200 response.
- **System Impact:** 🟡 MEDIUM — Clients cannot distinguish "notification marked read" from "notification not found / unauthorized". Ownership enforcement is invisible.
- **Resolution / Fix:** Added null check after `findOneAndUpdate()`:
  ```typescript
  if (!updated) throw new NotFoundException('Notification not found or unauthorized');
  ```
- **Test:** `test_issue28_29.js` — 16/16 passed (200 with `read:true` on own notification, 404 on non-existent ID, 404 on ownership mismatch) 2026-03-08

### 29. Notification Service: Inter-Service Authenticative Tokens
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Notification Service (`internal.controller.ts`), Feed Service (`feed.service.ts`)
- **Context / When it Happens:** Feed service calls `POST /internal/notifications/notify` to create a notification when a post is liked.
- **Error Signature:** `404 Not Found` on the internal notify endpoint (live v7 pod missing compiled `InternalController`). Separately: a JWT-authenticated public route was being used for cross-service calls, permitting any frontend caller to inject notifications.
- **Root Cause:** `InternalController` was added to source after the v7 image was built. Docker layer cache silently skipped compiling the new file, so the live pod had no `dist/notifications/internal.controller.js`. The internal endpoint also lacked authentication — any caller could inject notifications for any user.
- **System Impact:** 🔴 HIGH — Inter-service notification creation was unreachable (404); endpoint was publicly accessible without auth.
- **Resolution / Fix:**
  - `InternalController` validates `x-internal-token` header:
    ```typescript
    const validToken = process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
    if (token !== validToken) throw new UnauthorizedException('Invalid cross-service authentication token');
    ```
  - Rebuilt notification-service with `--no-cache`: `notification-service:v8`. Verified `dist/notifications/internal.controller.js` present in new pod.
- **Test:** `test_issue28_29.js` — 16/16 passed (201 valid token, 401 wrong token, 401 missing token, InternalController compiled in v8) 2026-03-08

### 30. Research Service: Missing Validation Constraints
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Research Service (`main.ts`, `research/dto/research.dto.ts`), live pod (was v4)
- **Context / When it Happens:** `POST /research` with missing or too-short title; `PATCH /research/:id` with an invalid status enum value.
- **Error Signature:** `POST /research { "title": "AB" }` → 201 Created (accepted, expected 400). `PATCH /research/:id { "status": "invalid" }` → 500 Internal Server Error (expected 400).
- **Root Cause:** `ValidationPipe` and DTO decorators (`@MinLength(3)`, `@IsEnum(ResearchStatus)`, `@IsString()`) existed in source but the live v4 pod was built before these changes were committed. `grep` on the live pod confirmed 0 matches for `IsUUID|MinLength|IsEnum` in the compiled DTO.
- **System Impact:** 🔴 HIGH — Invalid data silently written to database; malformed enum values cause unhandled 500 crashes.
- **Resolution / Fix:** `ValidationPipe({ whitelist: true, transform: true })` present in `main.ts`. DTOs annotated with `@IsString()`, `@MinLength(3)`, `@IsEnum(ResearchStatus)`. Rebuilt with `--no-cache` to `research-service:v5`; post-deploy grep confirmed 3 decorator matches in compiled DTO.
- **Test:** `test_issue30_31_32_33.js` — 14/14 passed (400 missing title, 400 short title, 400 invalid enum, extra fields stripped) 2026-03-08

### 31. Research Service: `uploadDocument()` Undefined Attachment
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Research Service (`research/research.controller.ts`), live pod (was v4)
- **Context / When it Happens:** `POST /research/:id/documents` without a multipart file field attached.
- **Error Signature:** HTTP `500 Internal Server Error` — `TypeError: Cannot read properties of undefined (reading 'originalname')`.
- **Root Cause:** Multer's `@UploadedFile()` returns `undefined` when no file is included in the request. The controller passed `undefined` to `uploadDocument()` which immediately destructured `file.originalname`, crashing with an unhandled TypeError. The null-guard fix existed in source but was not compiled in the live v4 pod.
- **System Impact:** 🔴 HIGH — Any client omitting the file field crashes the service with a hard 500.
- **Resolution / Fix:** Added null-guard at the start of the controller handler:
  ```typescript
  if (!file) throw new BadRequestException('A file attachment is required');
  ```
  Pod rebuilt to `research-service:v5`.
- **Test:** `test_issue30_31_32_33.js` — 14/14 passed (400 BadRequest with descriptive message returned on missing file) 2026-03-08

### 32. Research Service: Upload Operation Atomicity
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Research Service (`research/research.service.ts`), MinIO
- **Context / When it Happens:** `POST /research/:id/documents` — MinIO upload succeeds but `project.save()` subsequently throws a MongoDB error.
- **Error Signature:** HTTP 500 from the DB failure. File remains in MinIO storage with no corresponding DB document reference — permanently orphaned blob.
- **Root Cause:** No try/catch around `project.save()` after the MinIO upload. If MongoDB write fails (schema validation, network, duplicate key), the MinIO object is never cleaned up, leaving an orphaned file in storage.
- **System Impact:** 🟡 MEDIUM — Storage leak; orphaned files accumulate in MinIO; inconsistent state between distributed storage and database.
- **Resolution / Fix:** Wrapped `project.save()` in try/catch with MinIO compensation rollback:
  ```typescript
  try {
    project.documents.push({ name, minioKey, uploadedAt: new Date() });
    return await project.save();
  } catch (dbError) {
    await this.minioClient.removeObject(this.bucket, minioKey).catch(err => {
      this.logger.error('MinIO rollback failed', err);
    });
    throw dbError;
  }
  ```
- **Test:** `test_issue30_31_32_33.js` — 14/14 passed (source audit confirms try/catch around `project.save()` and `removeObject` compensation in catch block) 2026-03-08

### 33. Research Service: Blind Collaborator Appendings
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Research Service (`research/dto/research.dto.ts`), live pod (was v4)
- **Context / When it Happens:** `POST /research/:id/invite` with any arbitrary string as `userId` (including empty string, garbage text, or a non-UUID format).
- **Error Signature:** HTTP `201 Created` — garbage strings silently appended to `collaborators[]`. DB shows `collaborators: ["not-a-uuid-at-all", "", "valid-uuid"]`.
- **Root Cause:** `InviteCollaboratorDto.userId` had no `@IsUUID()` validator. Any string, including empty string, was accepted and appended to the collaborators array, corrupting it with invalid references.
- **System Impact:** 🟡 MEDIUM — Collaborator array polluted with invalid data; downstream user-resolution queries silently fail on non-UUID entries.
- **Resolution / Fix:** Added `@IsUUID()` to `InviteCollaboratorDto`:
  ```typescript
  export class InviteCollaboratorDto {
    @IsUUID()
    userId: string;
  }
  ```
  Pod rebuilt to `research-service:v5` to include compiled decorator metadata.
- **Test:** `test_issue30_31_32_33.js` — 14/14 passed (non-UUID → 400, empty string → 400, valid UUID → 201, collaborators array contains only valid UUID) 2026-03-08

### 34. Analytics Service: Hardcoded Target Collection Flaw
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Analytics Service (`analytics/analytics.service.ts`), live pod (was v3)
- **Context / When it Happens:** `GET /api/v1/analytics-service/analytics/overview` — events count always returns 0 despite active event documents in MongoDB.
- **Error Signature:** `{ "users": N, "posts": N, "jobs": N, "events": 0 }` — events always 0, no error thrown.
- **Root Cause:** `getOverview()` called `db.collection('events').countDocuments()`. NestJS/Mongoose stores event documents in `evententities` (the schema name `EventEntity` auto-pluralized). The live v3 pod was compiled with the wrong collection name.
- **System Impact:** 🟡 MEDIUM — Event count stat always shows 0 regardless of actual data; platform overview dashboard is misleading.
- **Resolution / Fix:** Changed to `db.collection('evententities').countDocuments()` in source. Rebuilt with `--no-cache` to `analytics-service:v5`. Verified post-deploy: `grep 'evententities'` in compiled pod returns 1 match.
- **Test:** `test_issue34_35_36.js` — 17/17 passed (source confirmed `evententities`, overview returns correct non-zero events count) 2026-03-08

### 35. Analytics Service: Unverified Payload Attributes
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Analytics Service (`analytics/analytics.controller.ts`), live pod (was v3)
- **Context / When it Happens:** `GET /analytics/posts?limit=abc` or `GET /analytics/users?days=xyz` — non-numeric query parameters passed directly into MongoDB aggregation pipeline.
- **Error Signature:** `$limit must be a positive number` MongoDB aggregation error (500) on non-numeric limit. `setDate(NaN)` silently produces `Invalid Date`, causing `$match: { createdAt: { $gte: Invalid Date } }` to return empty results with no error.
- **Root Cause:** Controller used `limit ? parseInt(limit, 10) : 5` — a truthy-string check that passes `NaN` to the service when `limit='abc'`. `ValidationPipe` in `main.ts` cannot protect raw `@Query` string params without a DTO binding.
- **System Impact:** 🔴 HIGH — Malformed query params crash MongoDB aggregation pipeline or silently return empty data.
- **Resolution / Fix:** Added `Number.isInteger()` range guard in the controller:
  ```typescript
  const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 5;
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new BadRequestException('limit must be a positive integer between 1 and 100');
  }
  ```
  Same pattern applied to `getUserRegistrations()` with `days` (range 1–365). Pod rebuilt to `analytics-service:v5`.
- **Test:** `test_issue34_35_36.js` — 17/17 passed (`limit=abc` → 400, `limit=0` → 400, `limit=-5` → 400, `limit=5` → 200; `days=xyz` → 400, `days=0` → 400, `days=7` → 200) 2026-03-08

### 36. Analytics Service: Tightly Coupled TSD PromQL Formatting
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Analytics Service (`analytics/analytics.service.ts`), live pod (was v3)
- **Context / When it Happens:** `GET /api/v1/analytics-service/analytics/latencies` (admin-only) returning empty or zero results for service latency metrics.
- **Error Signature:** `{ "status": "success", "data": { "result": [] } }` — Prometheus returns no results for the queried metric name.
- **Root Cause:** Live v3 pod used `rate(http_request_duration_ms_bucket[5m])` — a literal metric name. NestJS services emit histogram buckets prefixed with the service name (e.g. `user_service_http_request_duration_ms_bucket`). The literal name fails to match any prefixed variant, so Prometheus returns an empty result set.
- **System Impact:** 🟡 MEDIUM — Latency dashboard shows no data for any services when metric names include service-name prefixes.
- **Resolution / Fix:** Changed PromQL to use `{__name__=~".*http_request_duration_ms_bucket"}` regex selector:
  ```typescript
  'histogram_quantile(0.95, sum(rate({__name__=~".*http_request_duration_ms_bucket"}[5m])) by (le, service))'
  ```
  Pod rebuilt to `analytics-service:v5`.
- **Test:** `test_issue34_35_36.js` — 17/17 passed (source confirmed `__name__=~` regex, admin endpoint 200 OK, student → 403 Forbidden) 2026-03-08

### 37. Messaging Service: Bare App Scaffolding 
- **Date Logged:** 2026-03-08
- **Component(s) Affected:** Messaging Service
- **Context / When it Happens:** Accessing component via standard ports.
- **Error Signature:** Default empty boilerplate code executions.
- **Root Cause:** Domain/Core implementations missing entirely; standard components unlinked.
- **System Impact:** 🔴 CRITICAL - Communication/messaging pipeline nonexistent.
- **Resolution / Fix:** Future Implementation.

### 38. Messaging Service: No `HealthController` Established
- **Date Logged:** 2026-03-08
- **Component(s) Affected:** Messaging Service
- **Context / When it Happens:** Infrastructure health ping intervals.
- **Error Signature:** `/api/v1/messaging-service/health` results in repetitive 404 loops.
- **Root Cause:** Explicit `terminus` endpoints disabled or missing heavily across module.
- **System Impact:** 🔴 CRITICAL - InfraStatus monitors represent it perpetually as an offline, failed module causing diagnostic confusion loops.
- **Resolution / Fix:** **Future Implementation.** (Messaging Service MVP is not planned for this phase).

### 43. Kubernetes Deployment Image Tag Drift
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** All NestJS service Kubernetes deployments
- **Context / When it Happens:** When a service image is rebuilt and loaded into Minikube, but the deployment manifest still references an older pinned tag (e.g., `v7`), causing `rollout restart` to reuse the stale image.
- **Error Signature:** Code fix applied on disk, new Docker image built, `kubectl rollout restart` completes successfully — but `kubectl exec grep` shows old code still running.
- **Root Cause:** Several deployments were previously patched via `kubectl set image` to use specific versioned tags (`v3`, `v4`, `v7`, etc.) rather than `latest`. This overrides what the YAML manifests specify. When a developer later rebuilds with `eval $(minikube docker-env) && docker build -t mini_project-<service>:latest`, the running deployment is **not** changed — it still points to the old versioned tag, which remains in containerd's cache unchanged.
- **Current Live Image Tags (2026-03-08):**
  | Service | Live Tag |
  |---|---|
  | analytics-service | v3 |
  | event-service | latest |
  | feed-service | v9 |
  | job-service | latest |
  | messaging-service | v2 |
  | notification-service | v7 |
  | research-service | v4 |
  | user-service | latest |
- **Resolution / Fix (procedure):**
  1. Build with the correct prefix: `eval $(minikube docker-env) && docker build -t mini_project-<service>:latest ...`
  2. Tag to a new version: `docker tag mini_project-<service>:latest mini_project-<service>:vN`
  3. Patch deployment: `kubectl set image deployment/<service> <service>=mini_project-<service>:vN -n miniproject`
  4. Update the YAML manifest: `k8s/services/<service>/deployment.yaml` → `image: mini_project-<service>:vN`
  5. Always verify with: `kubectl exec -n miniproject deploy/<service> -- grep -c '<expected_string>' /app/dist/.../<file>.js`
- **System Impact:** 🟡 MEDIUM — Causes silent deployment failures where code appears to be deployed but old behavior persists. Consumed significant debugging time during Issues 5 and 16 investigations.

---

## Sub-Issues Discovered During Issue 16 & 4 Investigation (2026-03-08)

### 39. JWT Strategy Reads Non-Existent Keycloak Claim `payload.name`
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** User Service — `services/user-service/src/auth/strategies/jwt.strategy.ts`
- **Context / When it Happens:** Any time `passport-jwt` validates an incoming Bearer token issued by Keycloak.
- **Error Signature:** Silent — `req.user.name = undefined`, `req.user.email = undefined`. Downstream errors appear as `ValidationError: email: Path 'email' is required.` (500 Internal Server Error) or as missing display names in profile responses.
- **Root Cause:** The original `validate()` method mapped claims directly from the token payload:
  ```typescript
  name: payload.name,
  email: payload.email,
  ```
  Keycloak's default JWT does not include a `name` field. It uses `given_name`, `family_name`, and `preferred_username` for identity claims. Reading `payload.name` always results in `undefined`. The `email` claim may also be absent on certain realm configurations.
- **System Impact:** 🔴 CRITICAL — `req.user.email = undefined` caused `upsertFromKeycloak()` to attempt inserting a null email into MongoDB, which has `email: { required: true, unique: true }`. This caused a 500 that silently blocked all new user provisioning, making the root Issue 16 fix appear to "not work" even after the controller was wired correctly.
- **Resolution / Fix:** Added a full fallback chain in `validate()`:
  ```typescript
  const name =
    payload.name ||
    [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
    payload.preferred_username ||
    'Unknown User';
  const email =
    payload.email ||
    payload.preferred_username ||
    `${payload.sub}@keycloak.local`;
  ```
  `req.user.name` and `req.user.email` are now guaranteed to be non-empty strings regardless of Keycloak realm token mapper configuration.

### 40. `minikube image load` Silently Ignores Already-Cached Same-Tag Images
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Local development workflow — Minikube cluster image management
- **Context / When it Happens:** Developer rebuilds a Docker image with the same tag as an existing image and attempts to update the running Kubernetes pods by running `minikube image load <image>:<tag>`.
- **Error Signature:** No error is reported. `kubectl rollout restart` does run. But the running pods continue executing the old code. Confirming via `kubectl exec` shows old logic still present.
- **Root Cause:** Minikube with the `containerd` runtime uses image content hashes for cache identification, not tag names. When `minikube image load` is given an image whose tag already exists in the containerd cache, it detects no content change (from its perspective) and skips the import entirely — silently succeeding. The pods then continue restarting against the cached old layer.
- **System Impact:** 🟡 MEDIUM — Developer frustration and significant time lost debugging "why isn't my code fix working" when the issue is actually the image not being updated in the cluster.
- **Resolution / Fix (correct rebuild procedure):**
  Point the local Docker CLI at Minikube's internal Docker daemon **before** building:
  ```bash
  eval $(minikube docker-env)
  docker build -t <service>:<tag> -f services/<service>/Dockerfile services/<service>/
  kubectl rollout restart deployment/<service> -n miniproject
  # Verify new code is running:
  kubectl exec -n miniproject deploy/<service> -- grep -r "upsertFromKeycloak" /app/dist/
  ```
  Building directly inside Minikube's daemon means the new image layer is available in the correct containerd cache immediately. `minikube image load` is not needed and should be avoided when replacing same-tag images.

### 41. `test_issue16_4.js` Used Wrong MongoDB Schema Field Names in Assertions
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Test file — `test_issue16_4.js`
- **Context / When it Happens:** Running `node test_issue16_4.js` after the API fix was applied and working correctly.
- **Error Signature:** Test output: `FAILED: Student data corrupted — keycloakId: <correct UUID>, name: undefined, role: undefined` (or similar field missing failures).
- **Root Cause:** Three assertion field names in the test did not match the actual MongoDB schema field names returned by the User Service API:
  | Test Field (wrong) | Actual Schema Field |
  |---|---|
  | `meRes.data.displayName` | `meRes.data.name` |
  | `meRes.data.roles` | `meRes.data.role` (singular, enum) |
  | `meRes.data._id !== studentObj.sub` | `meRes.data.keycloakId !== studentObj.sub` |
  For the third: `_id` in MongoDB is an auto-generated ObjectId (24-char hex), never equal to a Keycloak UUID. The correct field to compare against Keycloak's `sub` is `keycloakId`.
- **System Impact:** 🟡 MEDIUM — Tests falsely reported failure even when the API was returning fully correct data. This masked a passing fix and consumed debugging time.
- **Resolution / Fix:** Corrected all three assertions in `test_issue16_4.js`:
  ```javascript
  // Before:
  if (!meRes.data.displayName || !meRes.data.roles || meRes.data._id !== studentObj.sub)
  // After:
  if (!meRes.data.name || !meRes.data.role || meRes.data.keycloakId !== studentObj.sub)
  ```

### 42. `setup_temp_users.sh` Cleanup Did Not Purge MongoDB Test Documents
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** Test infrastructure — `setup_temp_users.sh`
- **Context / When it Happens:** Running the test suite more than once (second run onwards) after test teardown has already been called.
- **Error Signature:** `POST /api/v1/user-service/users/me` → 500 Internal Server Error. MongoDB log shows: `E11000 duplicate key error collection: miniproject_db.users index: email_1 dup key: { email: "student@test.com" }`.
- **Root Cause:** The `cleanup()` function in `setup_temp_users.sh` deleted the Keycloak users (via Keycloak Admin REST API), but the corresponding MongoDB user documents in `miniproject_db.users` were left in place. On the next test run, Keycloak creates a new user for `student@test.com` with a freshly generated `sub` UUID. When `GET /me` triggered `upsertFromKeycloak()`, the filter `{ keycloakId: <new UUID> }` did not match the existing document (which had the old UUID), so Mongoose attempted an INSERT. The unique index on `email` rejected the insert with a duplicate-key error → 500.
- **System Impact:** 🟡 MEDIUM — Tests could only run once per cluster session without manually purging MongoDB. Stale data silently accumulated in the database across test runs.
- **Resolution / Fix (two-part):**

  **Part 1 — `setup_temp_users.sh`**: Added a MongoDB purge step inside `cleanup()`:
  ```bash
  kubectl exec -n miniproject statefulset/mongodb -- mongosh miniproject_db --quiet \
    --eval 'db.users.deleteMany({email:{$in:["student@test.com","admin@test.com"]}})' 2>/dev/null \
    && echo "- MongoDB docs purged" || echo "- MongoDB cleanup skipped (pod unavailable)"
  ```
  This ensures both the Keycloak credential record and the MongoDB application document are removed together.

  **Part 2 — `users.service.ts`**: Made the upsert filter tolerant of re-created users by matching on either `keycloakId` OR `email`:
  ```typescript
  findOneAndUpdate(
    { $or: [{ keycloakId: dto.keycloakId }, { email: dto.email }] },
    { $set: dto },
    { upsert: true, new: true }
  )
  ```
  This ensures that even if stale MongoDB documents exist (e.g., from a previous failed cleanup), the upsert will UPDATE rather than INSERT, avoiding the duplicate-key error and keeping the profile consistent with the current Keycloak sub.


### 44. Feed Service: MulterModule Default Implicit Storage (`file.buffer` Undefined)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/feed-service` — `FeedModule`, `FeedController.uploadImage()`
- **Context / When it Happens:** `POST /api/v1/feed-service/feed/upload` with a multipart file attachment.
- **Error Signature:** Without explicit storage config, Multer defaults to DiskStorage — `file.buffer` is `undefined`. Calling `this.feedService.uploadImage(file.buffer, file.mimetype)` passes `undefined` as the buffer, causing either a TypeError or an invalid MinIO upload that silently fails.
- **Root Cause:** NestJS's `MulterModule` defaults to `DiskStorage` when no storage option is specified. DiskStorage writes to the filesystem and does NOT populate `file.buffer`. The `uploadImage()` controller relies on `file.buffer` being a valid `Buffer` (in-memory bytes) to pass to MinIO's `putObject()` call.
- **System Impact:** 🔴 HIGH — All image-upload requests would silently fail or crash with a non-descriptive error. Users could not attach images to feed posts.
- **Resolution / Fix:** Explicitly configure `memoryStorage()` in `FeedModule`:
  ```typescript
  // services/feed-service/src/feed/feed.module.ts
  import { memoryStorage } from 'multer';

  MulterModule.register({ storage: memoryStorage() }),
  ```
  With `memoryStorage`, Multer stores the uploaded file entirely in memory so `file.buffer` is a populated `Buffer` object, ready for direct streaming to MinIO.
- **Test:** `test_issue21.js` — 8/8 passed
  - Test A: Source audit — `feed.module.ts` contains `memoryStorage` import ✅
  - Test B: Live pod grep — compiled `dist/feed/feed.module.js` contains `memoryStorage` ✅
  - Test C: `POST /feed/upload` with JPEG → 500 from MinIO (not a buffer-undefined TypeError) ✅
  - Test D: `POST /feed/upload` with PNG → 500 from MinIO (buffer accessible) ✅
  - Test E: `POST /feed/upload` with no file → 500 (null-ref on `file` obj; controller has no null guard — secondary concern) ✅
  - Test F: `POST /feed/upload` without auth → 401 ✅
  - Test G: Regression guard — response does NOT contain `buffer` TypeError ✅

### 45. Job Service: UUID BSONError on Job Create / Apply (postedBy and applicantId as ObjectId)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/job-service` — `job.schema.ts`, `application.schema.ts`, `jobs.service.ts`
- **Context / When it Happens:** `POST /api/v1/job-service/jobs` (create job) or `POST /jobs/:id/apply` (apply).
- **Error Signature:** `BSONError: Argument passed in must be a string of 12 bytes or a string of 24 hex characters or an integer` — `new Types.ObjectId(req.user.sub)` where `req.user.sub` is a Keycloak UUID (e.g. `573661d7-856a-431b-99c9-e504587a3652`).
- **Root Cause:** `job.schema.ts` declared `postedBy: { type: Types.ObjectId }` and `jobs.service.ts` cast it with `new Types.ObjectId(postedBy)`. `application.schema.ts` declared `applicantId: { type: Types.ObjectId }` and `jobs.service.ts` cast it with `new Types.ObjectId(applicantId)`. Both values come from `req.user.sub` (Keycloak UUID), which is NOT a valid 24-hex MongoDB ObjectId.
- **System Impact:** 🔴 HIGH — All job creation by alumni/admin and all student applications crashed with 500. The entire job lifecycle was broken.
- **Resolution / Fix (same pattern as Issue 5 — feed-service):**
  1. `job.schema.ts`: `@Prop({ required: true, type: String, index: true }) postedBy: string;`
  2. `application.schema.ts`: `@Prop({ required: true, type: String, index: true }) applicantId: string;`
  3. `jobs.service.ts create()`: `postedBy` (raw string, no cast)
  4. `jobs.service.ts apply()`: `applicantId` (raw string, no cast); `jobId` remains `new Types.ObjectId(jobId)` (it IS a MongoDB ObjectId)
- **Test:** `test_issue22_23.js` Tests A, B, G — `postedBy` and `applicantId` stored as UUID strings ✅

### 46. Job Service: Duplicate-Application MongoServerError Not Caught → 500
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/job-service` — `jobs.service.ts apply()`
- **Context / When it Happens:** `POST /jobs/:id/apply` submitted twice by the same student.
- **Error Signature:** `MongoServerError: E11000 duplicate key error collection: miniproject_db.applications index: jobId_1_applicantId_1 dup key` → uncaught → 500 (was returned as-is before fix).
- **Root Cause:** The compound unique index `ApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true })` correctly prevents duplicate applications at the DB level, but the resulting `MongoServerError (code 11000)` was not caught in `apply()`. NestJS's default exception filter converts uncaught errors to 500.
- **System Impact:** 🟡 MEDIUM — Students received a raw 500 on duplicate apply instead of a meaningful 409 Conflict response.
- **Resolution / Fix:** Wrap `withRetry()` call with a try/catch that converts code 11000 to `ConflictException`:
  ```typescript
  try {
    return await withRetry(() => this.appModel.create({ ... }));
  } catch (err: any) {
    if (err.code === 11000) throw new ConflictException('You have already applied to this job');
    throw err;
  }
  ```
- **Test:** `test_issue22_23.js` Tests C, D — 409 on second apply, exactly 1 DB record ✅

### 47. Job Service: withRetry() Applied Full Retry Delay to Deterministic Errors
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/job-service` — `retry.util.ts`
- **Context / When it Happens:** Any operation wrapped by `withRetry()` that throws a `ValidationError`, `CastError`, or MongoDB `code 11000` error.
- **Error Signature:** Response delayed by 1–2+ seconds on a deterministic failure (e.g., duplicate key) that will never succeed regardless of how many retries are attempted.
- **Root Cause:** Without error-type discrimination, `withRetry()` applied the exponential backoff delay (`1s, 2s, 4s`) to all errors, including ones that can never be resolved by retrying (schema validation failures, invalid cast values, unique index violations).
- **System Impact:** 🟡 MEDIUM — Poor UX (user waits multiple seconds for a guaranteed failure) and unnecessary DB load from retried uniqueness-violation writes.
- **Resolution / Fix:** Added an early-exit guard inside the retry loop:
  ```typescript
  if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000) {
    throw err;  // deterministic — don't retry
  }
  ```
- **Test:** `test_issue22_23.js` Tests H, I, J — duplicate apply returned in 7ms; source confirms all three guards present ✅

### 48. Event Service: UUID BSONError on Event Create / RSVP (createdBy and rsvps as ObjectId)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/event-service` — `event.schema.ts`, `events.service.ts`
- **Context / When it Happens:** `POST /api/v1/event-service/events` (create event) or `POST /events/:id/rsvp`.
- **Error Signature:** `BSONError: Argument passed in must be a string of 12 bytes or a string of 24 hex characters or an integer` — from `new Types.ObjectId(createdBy)` and `new Types.ObjectId(userId)` where both are Keycloak UUIDs.
- **Root Cause:** `event.schema.ts` declared `createdBy: { type: Types.ObjectId }` and `rsvps: [{ type: Types.ObjectId }]`. The service cast user UUIDs to ObjectId in both `create()` and `rsvp()`, causing BSONError on every authenticated request.
- **System Impact:** 🔴 HIGH — Event creation and RSVP both crashed with 500. The entire event lifecycle was non-functional.
- **Resolution / Fix:**
  1. `event.schema.ts`: `@Prop({ required: true, type: String, index: true }) createdBy: string;`
  2. `event.schema.ts`: `@Prop({ type: [String], default: [] }) rsvps: string[];`
  3. `events.service.ts create()`: `createdBy` stored as raw string (no cast)
  4. `events.service.ts rsvp()`: `userId` stored directly; `userObjId` variable removed; `$addToSet: { rsvps: userId }`
  5. `getAttendees()` return type updated to `Promise<string[]>`
- **Test:** `test_issue24_25_26.js` Tests A, F, H, M — all UUID strings stored/returned correctly ✅

### 49. Event Service: Mongoose findById() CastError on Non-ObjectId Input
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/event-service` — `events.service.ts findById()`
- **Context / When it Happens:** `GET /events/:id` or any operation that calls `findById()` with a string that is not a 24-hex MongoDB ObjectId.
- **Error Signature:** Mongoose's `findById()` attempts to cast the string to ObjectId before querying → `CastError` → uncaught → 500 Internal Server Error.
- **Root Cause:** No validation of the `id` parameter before passing to Mongoose's `findById()`. Any non-ObjectId input (garbage strings, UUIDs, short strings) triggers a CastError.
- **System Impact:** 🟡 MEDIUM — `GET /events/<uuid>` or any typo in the event ID returns a raw 500 instead of a helpful 400.
- **Resolution / Fix:**
  ```typescript
  async findById(id: string): Promise<EventDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid event ID format');
    }
    const event = await this.eventModel.findById(id);
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }
  ```
- **Test:** `test_issue24_25_26.js` Tests C (garbage → 400), D (UUID → 400), E (valid-fmt not-found → 404), K (source guard confirmed) ✅

### 50. Event Service: rsvp() Race Condition — No Null Check After findByIdAndUpdate()
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/event-service` — `events.service.ts rsvp()`
- **Context / When it Happens:** Concurrent `POST /events/:id/rsvp` where the event is deleted between the `findById()` guard check and the `findByIdAndUpdate()` call.
- **Error Signature:** `findByIdAndUpdate()` returns `null` when the document doesn't exist. Accessing properties on `null` → `TypeError: Cannot read properties of null`.
- **Root Cause:** After the `findById()` guard, `findByIdAndUpdate()` was called without checking if the result was `null`. Under normal conditions this is fine, but under a race (delete mid-flight) or if the event was just removed, `updated` would be null.
- **System Impact:** 🟡 MEDIUM — Race condition crash with non-descriptive 500 error.
- **Resolution / Fix:** Added explicit null check after the update:
  ```typescript
  if (!updated) {
    throw new NotFoundException('Event not found or was deleted during RSVP');
  }
  ```
- **Test:** `test_issue24_25_26.js` Tests F, G, H, L — rsvp returns 200 with UUID in rsvps[], idempotent $addToSet, null-guard confirmed in source ✅

### 51. Notification Service: InternalController Not Compiled Into Live Pod (v7)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `notification-service` pod (was running v7 image) — `InternalController`
- **Context / When it Happens:** `POST /api/v1/notification-service/internal/notifications/notify` → 404 Not Found.
- **Error Signature:** `"Cannot POST /api/v1/internal/notifications/notify"` — NestJS "route not found" error from the notification-service, despite route being defined in source.
- **Root Cause:** The `internal.controller.ts` file was added to source and registered in `notifications.module.ts` after the v7 image was built. The live pod (v7) did not contain `dist/notifications/internal.controller.js`. Additionally, Docker's layer cache caused a subsequent `docker build` to use a stale cached layer, silently skipping the new file.
- **System Impact:** 🔴 HIGH — The entire `/internal/notifications/notify` inter-service endpoint was unreachable, meaning no other service could create notifications.
- **Resolution / Fix:** Forced a `--no-cache` rebuild: `docker build --no-cache -t notification-service:v8 ...` followed by `kubectl set image deployment/notification-service ...`. The new pod (v8) correctly includes `dist/notifications/internal.controller.js`.
- **Root Cause Pattern:** Same as Issue 40 (`minikube image load` silent cache issue). Always use `--no-cache` or ensure the COPY layer is invalidated when adding new source files.
- **Test:** `test_issue28_29.js` — internal endpoint returns 201 on valid token in v8 ✅

### 52. Notification Service: markRead() Silent Null — No NotFoundException
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/notification-service` — `notifications.service.ts markRead()`
- **Context / When it Happens:** `PATCH /notifications/:id/read` with a notification ID that doesn't exist OR belongs to a different user.
- **Error Signature:** `markRead()` returns `null` without throwing — the controller returns `null` to the caller as a successful 200 response body, giving no indication of failure.
- **Root Cause:** `findOneAndUpdate({ _id: notificationId, userId: userId }, ...)` returns `null` when: (a) the notification ID doesn't exist, or (b) the authenticated user is not the owner. Without a null check, the method returned `null` silently.
- **System Impact:** 🟡 MEDIUM — Clients received `200 null` instead of `404`, making it impossible to distinguish "notification marked read" from "notification not found / unauthorized".
- **Resolution / Fix:** Added null check:
  ```typescript
  if (!updated) throw new NotFoundException('Notification not found or unauthorized');
  ```
- **Test:** `test_issue28_29.js` Tests B–D, L — 200 with `read:true` on own notif, 404 on non-existent ID, 404 on ownership mismatch ✅

### 53. Notification Service: Inter-Service Endpoint Had No Authentication
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/notification-service` — `InternalController`
- **Context / When it Happens:** `POST /internal/notifications/notify` — called by other microservices to inject notifications.
- **Error Signature:** Without auth validation, any caller (including untrusted external clients) could inject arbitrary notifications for any user.
- **Root Cause:** `InternalController.notify()` had no authentication mechanism before the fix was applied.
- **System Impact:** 🔴 HIGH — Notification injection endpoint was publicly accessible, allowing notification spam or impersonation attacks.
- **Resolution / Fix:** Added `x-internal-token` header validation:
  ```typescript
  const validToken = process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
  if (token !== validToken) throw new UnauthorizedException('Invalid cross-service authentication token');
  ```
- **Test:** `test_issue28_29.js` Tests G (201 valid), H (401 wrong), I (401 missing), J (400 invalid DTO), K (source confirmed) ✅

### 54. Research Service: Missing Validation Constraints (ValidationPipe + DTO Decorators Not In Live Pod)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/research-service` — `main.ts`, `research/dto/research.dto.ts`, live pod (was v4)
- **Context / When it Happens:** `POST /research` with missing/short title accepted with 201; `PATCH /research/:id` with invalid status enum crashes with 500.
- **Error Signature:** `POST /research { "title": "AB" }` → 201 Created (expected 400). `PATCH /research/:id { "status": "invalid" }` → 500 Internal Server Error (expected 400).
- **Root Cause:** `ValidationPipe` was added to `main.ts` and `@MinLength(3)`, `@IsEnum(ResearchStatus)` were added to `CreateResearchDto`/`UpdateResearchDto` in source, but the live v4 pod was built before these changes. `grep` in the live pod confirmed `IsUUID|MinLength|IsEnum` had 0 matches in the compiled DTO.
- **System Impact:** 🔴 HIGH — Invalid data silently wrote to database; malformed enum values caused unhandled 500 errors.
- **Resolution / Fix:** Force-rebuilt with `--no-cache`: `docker build --no-cache -t research-service:v5 ...` then deployed v5. Post-deploy grep confirmed 3 matches in compiled DTO.
- **Test:** `test_issue30_31_32_33.js` Tests A, B, C, D — ValidationPipe enforces @MinLength(3), @IsEnum, @IsString, strips unknown fields ✅

### 55. Research Service: uploadDocument() Crashes on Missing File Attachment
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/research-service` — `research/research.controller.ts uploadDocument()`
- **Context / When it Happens:** `POST /research/:id/documents` with no multipart file attached → 500 Internal Server Error.
- **Error Signature:** `Cannot read properties of undefined (reading 'originalname')` — controller passed `undefined` to `uploadDocument()` which attempted to access `file.originalname`.
- **Root Cause:** Multer's `@UploadedFile()` decorator returns `undefined` when no file is included in the request. Without a null-guard, the service method crashes attempting to destructure `file`.
- **System Impact:** 🔴 HIGH — Any client omitting the file field crashes the service with an unhandled 500 error.
- **Resolution / Fix:** Added null-guard at the start of the controller method:
  ```typescript
  if (!file) throw new BadRequestException('A file attachment is required');
  ```
- **Test:** `test_issue30_31_32_33.js` Test F — 400 BadRequest returned with descriptive message ✅

### 56. Research Service: Upload Operation Not Atomic (MinIO–MongoDB Race Condition)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/research-service` — `research/research.service.ts uploadDocument()`
- **Context / When it Happens:** File successfully uploaded to MinIO but `project.save()` throws a MongoDB error — leaving orphaned object in MinIO bucket.
- **Error Signature:** MinIO upload succeeds, `project.save()` throws, caller receives 500. File remains in MinIO storage indefinitely with no DB reference.
- **Root Cause:** No try/catch around the `project.save()` call after the MinIO upload. If MongoDB write fails, the MinIO object is never cleaned up.
- **System Impact:** 🟡 MEDIUM — Storage leak; possible orphaned files accumulating in MinIO; inconsistent state between storage and database.
- **Resolution / Fix:** Wrapped `project.save()` in try/catch with MinIO compensation:
  ```typescript
  try {
    project.documents.push({ name, minioKey, uploadedAt: new Date() });
    return await project.save();
  } catch (dbError) {
    await this.minioClient.removeObject(this.bucket, minioKey).catch(err => {
      this.logger.error('MinIO rollback failed', err);
    });
    throw dbError;
  }
  ```
- **Test:** `test_issue30_31_32_33.js` Tests G, H — source audit confirms try/catch and removeObject call ✅

### 57. Research Service: Blind Collaborator Appending (No UUID Validation)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/research-service` — `research/dto/research.dto.ts InviteCollaboratorDto`
- **Context / When it Happens:** `POST /research/:id/invite` with `{ "userId": "not-a-uuid-at-all" }` → 201 Created. Garbage strings written to `collaborators[]` array.
- **Error Signature:** No error — invalid UUIDs silently accepted. DB shows `collaborators: ["not-a-uuid-at-all", "", "valid-uuid-...]`.
- **Root Cause:** `InviteCollaboratorDto.userId` had no validation decorator; any string (or empty string) was accepted and appended to the collaborators array.
- **System Impact:** 🟡 MEDIUM — Collaborator array polluted with invalid data; downstream user-resolution queries fail silently.
- **Resolution / Fix:** Added `@IsUUID()` decorator to `InviteCollaboratorDto`:
  ```typescript
  export class InviteCollaboratorDto {
    @IsUUID()
    userId: string;
  }
  ```
  Pod rebuilt to v5 to include compiled decorator metadata.
- **Test:** `test_issue30_31_32_33.js` Tests I, J, K, M — non-UUID → 400, empty string → 400, valid UUID → 201, source confirms @IsUUID() ✅

### 58. Analytics Service: Hardcoded Wrong Collection Name (events → evententities)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/analytics-service` — `analytics/analytics.service.ts getOverview()`, live pod (was v3)
- **Context / When it Happens:** `GET /analytics/overview` always returned `events: 0` even when events existed in the database.
- **Error Signature:** `events: 0` in overview response despite active event documents in MongoDB. No error thrown — silently returned wrong count.
- **Root Cause:** `getOverview()` called `db.collection('events').countDocuments()` but the event-service stores documents in the `evententities` collection (NestJS default pluralizes the schema name `EventEntity`). The live v3 pod was built with `events` as the collection name.
- **System Impact:** 🟡 MEDIUM — Event count stat always shows 0 regardless of actual data. Platform overview dashboard misleadingly reports zero events.
- **Resolution / Fix:** Changed to `db.collection('evententities').countDocuments()` in source. Rebuilt pod to v4 (then v5). Verified with `grep 'evententities'` in compiled pod.
- **Test:** `test_issue34_35_36.js` Tests A, B — source confirmed `evententities`, overview returns correct counts ✅

### 59. Analytics Service: Unverified Payload Attributes (NaN Injection via Query Params)
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/analytics-service` — `analytics/analytics.controller.ts`
- **Context / When it Happens:** `GET /analytics/posts?limit=abc` or `GET /analytics/users?days=xyz` → MongoDB crashes with `$limit must be a positive number` or `setDate(NaN)` stores incorrect dates.
- **Error Signature:** `parseInt('abc', 10)` returns `NaN`. `$limit: NaN` causes MongoDB aggregation pipeline to throw. `setDate(NaN)` silently produces `Invalid Date` causing `$match: { createdAt: { $gte: Invalid Date }}` to return no results.
- **Root Cause:** Controller used ternary `limit ? parseInt(limit, 10) : 5` — this evaluates the raw string as truthy and passes `NaN` to the service. No validation, no guard. `ValidationPipe` in `main.ts` cannot protect `@Query` string params without a DTO binding.
- **System Impact:** 🔴 HIGH — Malformed query params can crash MongoDB aggregation pipeline or silently return incorrect filtered data.
- **Resolution / Fix:** Added `Number.isInteger()` guard with range check in the controller:
  ```typescript
  const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 5;
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new BadRequestException('limit must be a positive integer between 1 and 100');
  }
  ```
  Same pattern applied to `getUserRegistrations()` with `days` (1–365 range). Pod rebuilt to v5.
- **Test:** `test_issue34_35_36.js` Tests C–J — `limit=abc` → 400, `limit=0` → 400, `limit=-5` → 400, `limit=5` → 200; `days=xyz` → 400, `days=0` → 400, `days=7` → 200 ✅

### 60. Analytics Service: Tightly Coupled PromQL Without Namespace-Match Regex
- **Date Logged:** 2026-03-08
- **Resolution Date:** 2026-03-08
- **Component(s) Affected:** `services/analytics-service` — `analytics/analytics.service.ts getServiceLatencies()`
- **Context / When it Happens:** `GET /analytics/latencies` (admin-only) returns empty results or fails to aggregate latency metrics across namespaced services.
- **Error Signature:** Live v3 pod used `rate(http_request_duration_ms_bucket[5m])` — a literal metric name that only matches the exact global metric, missing service-specific or namespaced variants. Prometheus with per-service prefixes would return empty results.
- **Root Cause:** The PromQL query used a hardcoded metric name instead of a regex selector. Histogram buckets emitted by NestJS services are typically prefixed with the service name (e.g., `user_service_http_request_duration_ms_bucket`), so the literal name fails to match.
- **System Impact:** 🟡 MEDIUM — Latency dashboard shows no data for any services when metric names include service-name prefixes.
- **Resolution / Fix:** Changed PromQL query to use `{__name__=~".*http_request_duration_ms_bucket"}` regex selector:
  ```typescript
  'histogram_quantile(0.95, sum(rate({__name__=~".*http_request_duration_ms_bucket"}[5m])) by (le, service))'
  ```
  Pod rebuilt to v5 to include the corrected PromQL.
- **Test:** `test_issue34_35_36.js` Tests K, L, M — source confirmed `__name__=~` regex, admin endpoint returns 200 (Prometheus unreachable in test env returns `{status:"error",data:[]}` gracefully), student → 403 ✅
