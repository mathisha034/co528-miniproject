# System Restoration Report - 2026-03-18

## Scope
This report documents the full analytical recovery workflow performed after system-wide runtime failures (cluster unreachable, auth failures, and frontend/backend operational disruption).

## Initial Symptoms Reported
- Frontend dashboard authentication and API failures.
- Prior verification attempts failed with timeouts to miniproject.local and Kubernetes API.
- Platform appeared down from both browser and command-line probes.

## Root Cause Timeline

### 1) Infrastructure Reachability Failure
- Symptom:
  - kubectl timed out to 192.168.59.101:8443
  - HTTP/HTTPS probes to miniproject.local timed out
- Diagnosis:
  - minikube status showed host/apiserver/kubelet stopped
- Root Cause:
  - Local minikube VM was stopped.

### 2) Backup Workload Failure
- Symptom:
  - mongodb-backup CronJob pod in ImagePullBackOff
- Diagnosis:
  - Pod events showed pull access denied for image mini_project-backup:v2
- Root Cause:
  - Backup image was not present in the active minikube Docker runtime.

### 3) Authentication Platform Failure
- Symptom:
  - Keycloak token endpoint returned {"error":"Realm does not exist"}
  - Protected APIs returned 401 (Invalid or missing JWT token)
- Diagnosis:
  - Keycloak logs showed fresh DB initialization and only master realm bootstrap
- Root Cause:
  - miniproject realm, clients, and test users were missing after Keycloak data reset.

### 4) JWT Verification Failure in Services
- Symptom:
  - Even after realm/users restored, GET /api/v1/user-service/users/me returned 401
- Diagnosis:
  - jwt-secret KEYCLOAK_PUBLIC_KEY checksum differed from current realm key checksum
- Root Cause:
  - Services were verifying JWTs with a stale public key from jwt-secret.

### 5) Persona Setup Automation Failure
- Symptom:
  - tests/e2e/setup_personas.sh failed at step 1 (cannot get master token)
- Diagnosis:
  - Script called Keycloak at http://localhost:18080/... while current deployment uses /auth relative path
- Root Cause:
  - Script base URL was not compatible with /auth deployments.

## Corrective Actions Performed

### A. Restored Infrastructure
1. Started minikube using the correct existing driver:
   - minikube start --driver=virtualbox
2. Verified node, namespace, and ingress health.
3. Confirmed host mapping and ingress reachability:
   - miniproject.local resolves and HTTPS auth endpoint responds.

### B. Repaired Backup Runtime
1. Built missing backup image in minikube Docker daemon:
   - docker build -t mini_project-backup:v2 infra/backup
2. Triggered manual backup job from CronJob.
3. Verified backup jobs completed successfully.

### C. Reprovisioned Keycloak Runtime State
1. Recreated realm miniproject.
2. Recreated roles: student, alumni, admin.
3. Recreated clients: react-web-app and e2e-test-client.
4. Set access token lifespan to 3600.

### D. Fixed Automation Script Compatibility
1. Updated tests/e2e/setup_personas.sh:
   - Added automatic detection of /auth base path.
2. Re-ran script successfully to recreate e2e users and regenerate token/id artifacts.

### E. Rotated JWT Verification Key and Restarted Services
1. Pulled active Keycloak realm public key.
2. Updated jwt-secret KEYCLOAK_PUBLIC_KEY and JWT_PUBLIC_KEY with current key.
3. Restarted all miniproject deployments.
4. Waited for rollout completion of all service deployments.

## Verification Evidence

### OS-Level
- docker and containerd active
- CPU/memory/disk had headroom (no exhaustion condition)
- network routing on host healthy

### Infrastructure-Level
- minikube node Ready
- ingress resources active
- only non-running pods are expected Completed backup jobs

### Backend Software-Level
- Health endpoints via ingress all returned 200:
  - user-service, feed-service, job-service, event-service,
    notification-service, research-service, analytics-service
- Protected endpoints returned 200 with valid token:
  - GET /api/v1/user-service/users/me
  - GET /api/v1/notification-service/notifications/count

### Frontend Software-Level
- web build succeeded (vite build)
- Vite dev server running on localhost:5173
- frontend proxy checks succeeded:
  - /auth/realms/miniproject/.well-known/openid-configuration -> 200
  - /api/v1/user-service/users/me with token -> 200

### Browser-Driven Smoke Flow Evidence (Login -> Dashboard -> Profile -> Notifications -> Feed/Jobs/Events)
- **Execution Date/Time:** 2026-03-18 (UTC ~04:31-04:32)
- **Method:** Headless Chromium (Playwright) against `http://localhost:5173`
- **Requested Flow:** login -> dashboard -> profile -> notifications -> feed/jobs/events
- **Observed Result:** **Blocked at login callback** before dashboard navigation.

Captured evidence summary:
- Browser reached Keycloak login form (`Sign in to your account`) with expected fields (`#username`, `#password`, `#kc-login`).
- Submitted valid test credentials (`e2e_admin` / `pass123`).
- Redirected to Keycloak authenticate callback URL, then failed with browser page message:
  - `We are sorry... Cookie not found. Please make sure cookies are enabled in your browser.`
- Because auth session was not established, app route checks could not proceed to Profile/Notifications/Feed/Jobs/Events within the same browser session.

Automated run artifact (captured at runtime):
- `overall: fail`
- `flow.dashboard.pass: false` (still on Keycloak sign-in state)
- `error: locator.click timeout while trying to open Profile link`

Interpretation:
- This is an **auth cookie/session continuity** issue on the localhost callback path, not a backend service outage.
- API and proxy verifications remain green (200) with valid bearer tokens, and services are healthy.
- Browser flow from local HTTP origin still experiences callback cookie loss in this environment.

## Files Changed During Recovery
- tests/e2e/setup_personas.sh
  - Added Keycloak base-path auto-detection (/auth compatible)
- Runtime cluster resources updated (kubectl apply/rollout):
  - secret/jwt-secret (rotated public key)
  - deployments in namespace miniproject restarted

## Final Status
- System restored to working condition.
- Backend and frontend are operational.
- Authentication path (Keycloak -> JWT -> protected APIs) is healthy.
- Backup workload image issue resolved.
- **Exception (browser UI path):** full interactive login smoke from `http://localhost:5173` remains blocked by Keycloak cookie callback error in this environment.

## Preventive Recommendations
1. Add a post-Keycloak-start hook to auto-bootstrap realm/clients if missing.
2. Add a key-sync job or script to refresh jwt-secret from current Keycloak realm key after realm recreation.
3. Keep tests/e2e/setup_personas.sh as the canonical provisioning script (now /auth aware).
4. Add a quick health script that verifies:
   - minikube status
   - realm existence
   - protected API call with persona token
   - frontend proxy auth endpoint

## V6 Stage Gate Baseline Snapshot (Auth Session Stability)

- **Captured:** 2026-03-18
- **Purpose:** Mandatory pre-implementation test gate for `implementation_plan_v6_auth_session_stability.md`

### Baseline Test Results

1. Credential token baseline (Keycloak token endpoint):
  - `e2e_student/pass123` -> HTTP 200
  - `e2e_alumni/pass123` -> HTTP 200
  - `e2e_admin/pass123` -> HTTP 200

2. Origin protocol baseline:
  - `http://localhost:5173` -> HTTP 200
  - `https://localhost:5173` -> TLS failure (`wrong version number`)

3. Error signature baseline in Keycloak logs:
  - Repeated `LOGIN_ERROR` with `error="cookie_not_found"` in recent log window.

### Baseline Conclusion

- Credential validity is confirmed.
- Browser callback session continuity is still failing on insecure localhost origin.
- Secure-origin enforcement and auth-flow hardening are required before full browser smoke verification.

## V6 Implementation Evidence - Task Groups B/C/D

- **Captured:** 2026-03-18
- **Objective:** Apply HTTPS-first localhost auth flow and prevent insecure-origin login loops.

### B. Secure Dev Origin Implementation

Changes applied:
- `web/vite.config.ts`
  - Added HTTPS dev mode toggle (`VITE_DEV_HTTPS=1`)
  - Secure dev port switched to `5174` when HTTPS mode is enabled
  - Added basic SSL plugin activation in HTTPS mode
- `web/package.json`
  - Added script: `dev:https`
  - Added dependency: `@vitejs/plugin-basic-ssl`

Validation:
- `https://localhost:5174` -> HTTP 200 (with `curl -k`)
- Web build succeeds after changes (`npm run build`)

### C. Keycloak Client Hardening

Changes applied to client `react-web-app`:
- `redirectUris` set to:
  - `https://localhost:5174/*`
  - `https://miniproject.local/*`
- `webOrigins` set to:
  - `https://localhost:5174`
  - `https://miniproject.local`
- `rootUrl` set to `https://localhost:5174`

Validation:
- Auth request with `redirect_uri=http://localhost:5173/` -> HTTP 400 (rejected)
- Auth request with `redirect_uri=https://localhost:5174/` -> HTTP 200 (accepted)

### D. Frontend Guardrails

Changes applied:
- `web/src/lib/keycloak.ts`
  - Added insecure localhost origin gate to prevent Keycloak init on HTTP localhost
  - Added actionable remediation message for developers
- `web/src/contexts/AuthContext.tsx`
  - Added `authError` state propagation
- `web/src/components/ProtectedRoute.tsx`
  - Added explicit auth setup guidance UI when guard blocks insecure-origin auth init

Status:
- Task Groups B, C, and D completed.
- Remaining work: full browser smoke verification and post-change cookie_not_found regression check (Task Group E/G).

## V6 Final Browser Verification (Task Groups E/G Completion)

- **Captured:** 2026-03-18
- **Method:** Headless Chromium (Playwright)

### Additional Root Cause Found During Browser Verification

Even after HTTPS localhost enablement, browser login initially still failed with `cookie_not_found`.

Observed behavior:
- Login initiated on proxied host `https://localhost:5174/auth/...`.
- Credential submit moved to absolute Keycloak action URL on `https://miniproject.local/auth/login-actions/authenticate?...`.

Impact:
- Session cookie continuity broke across host boundary (`localhost` -> `miniproject.local`) during login-actions step.

Final correction:
- Updated frontend Keycloak configuration to use explicit host URL:
  - `VITE_KEYCLOAK_URL` (default `https://miniproject.local/auth`)
- This keeps Keycloak auth pages and login-actions on the same host origin for session cookie consistency.

### Browser-Driven Positive Flow Results

1. Secure login callback:
- `e2e_admin` login redirects successfully to `https://localhost:5174/?code=...`.

2. Route smoke pass (authenticated):
- `/` -> pass
- `/profile` -> pass
- `/notifications` -> pass
- `/feed` -> pass
- `/jobs` -> pass
- `/events` -> pass

3. Stability checks:
- `e2e_admin` secure callback repeated 3 times -> `3/3` pass.
- `e2e_student` secure callback -> pass.
- `e2e_alumni` secure callback -> pass.

4. Protected API verification (post-auth tokens):
- `/api/v1/user-service/users/me` -> 200 for `e2e_student`, `e2e_alumni`, `e2e_admin`.

### Browser-Driven Negative Path Results

Using a fresh HTTP runtime (`http://localhost:5175`):
- Insecure-origin auth guard message is displayed (`Authentication Setup Required`).
- No redirect loop to `/auth/...` observed.

### Final Log Window Check

- Focused secure callback run followed by immediate 1-minute Keycloak log check:
  - No `cookie_not_found` and no new `LOGIN_ERROR` entries.

Conclusion:
- Task Groups E and G criteria are satisfied for secure-origin flow.
- Cookie-not-found regression is controlled with direct Keycloak host configuration and HTTPS-first dev/runtime policy.
