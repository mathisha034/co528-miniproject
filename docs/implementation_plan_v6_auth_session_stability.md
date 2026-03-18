# Implementation Plan V6.0 - Auth Session Stability (Cookie Not Found)

Date: 2026-03-18
Status: Ready for execution
Owner: Platform + Web
Scope: Fix browser login failure showing "Cookie not found" while credentials are valid.

## 1. Problem Statement

Users can authenticate with valid credentials at the token endpoint, but interactive browser login fails with Keycloak "cookie_not_found" during callback.

## 2. Verified Evidence (Pre-Implementation)

1. Credential validity confirmed:
- e2e_student/pass123 -> token endpoint HTTP 200
- e2e_alumni/pass123 -> token endpoint HTTP 200
- e2e_admin/pass123 -> token endpoint HTTP 200

2. Keycloak server logs confirm session-cookie failure:
- LOGIN_ERROR error="cookie_not_found" appears repeatedly

3. Current frontend dev origin is insecure for this flow:
- http://localhost:5173 -> HTTP 200
- https://localhost:5173 -> TLS handshake failure

Conclusion: This is a browser session continuity issue, not a credential issue.

## 3. Root Cause

OIDC login is initiated from insecure HTTP localhost while Keycloak auth session cookies are issued with secure attributes. During redirect/callback, browser policy prevents reliable session cookie continuity, producing cookie_not_found.

## 4. Target Architecture (Desired End State)

1. All browser-facing auth traffic uses HTTPS origin.
2. Frontend dev login runs on HTTPS localhost (or ingress HTTPS host only).
3. Keycloak client redirect URIs are tightened to HTTPS-first.
4. Browser smoke validation runs only on secure origin.
5. Monitoring includes cookie_not_found regression checks.

## 5. Solution Strategy

### Mandatory Testing Gate (Before Any Phase Execution)

No implementation phase may start unless this gate is green:

1. Token baseline test:
- e2e_student, e2e_alumni, e2e_admin return HTTP 200 at token endpoint.

2. Origin protocol test:
- Active frontend login origin is HTTPS for the intended test run.

3. Keycloak error baseline test:
- Capture current cookie_not_found count for time-window comparison.

4. Environment readiness test:
- keycloak pod is Running and ingress endpoints are reachable.

If any gate item fails, fix the environment first and do not proceed to Phase A/B/C changes.

### Phase A - Secure Origin Enforcement

1. Enable HTTPS for local Vite dev server.
2. Use dedicated secure dev port (recommended: 5174).
3. Update run instructions to use HTTPS origin for login tests.

### Phase B - Keycloak Client Hardening

1. Keep react-web-app redirect URI for https://localhost:5174/*.
2. Keep ingress URI https://miniproject.local/*.
3. Remove or deprioritize insecure http://localhost:5173/* for login-required flows.
4. Verify webOrigins and redirect URIs are explicit and minimal.

### Phase C - Frontend Guardrails

1. Add runtime guard: if app runs on insecure origin in login-required mode, show explicit warning and block auth init.
2. Keep Keycloak URL as relative /auth so ingress/proxy remains environment-agnostic.

### Phase D - Verification and Evidence

1. Credential matrix check (token endpoint) for e2e users.
2. Browser flow check on secure origin:
- login -> dashboard -> profile -> notifications -> feed -> jobs -> events
3. Keycloak logs check:
- no new cookie_not_found entries during test window
4. Documentation update with pass/fail evidence.

### Phase E - Regression Test Pack (Post-Implementation)

1. Auth callback stability test:
- Run 3 consecutive browser login attempts on HTTPS origin with e2e_admin.
- Pass condition: 3/3 successful callback and dashboard load.

2. Multi-user auth test:
- Run login flow once each for e2e_student and e2e_alumni on HTTPS origin.
- Pass condition: successful callback and protected API access.

3. Log regression test:
- Inspect Keycloak logs for implementation test window.
- Pass condition: no new cookie_not_found entries attributable to the secure-origin flow.

4. Fallback behavior test:
- Launch app on HTTP origin intentionally.
- Pass condition: frontend guardrail message appears; no broken redirect loop.

## 6. Acceptance Criteria

All must pass:

1. Browser login succeeds on secure origin with e2e_admin/pass123.
2. Protected frontend API calls return success post-login.
3. No cookie_not_found for the successful test window in Keycloak logs.
4. Re-run with e2e_student and e2e_alumni confirms stable callback behavior.
5. Updated runbook includes HTTPS login requirements.
6. Regression Test Pack results are recorded with timestamps and pass/fail outcomes.

## 7. Risks and Mitigations

1. Risk: Self-signed cert prompts or trust issues.
- Mitigation: Document trust/ignore-cert path for local dev only.

2. Risk: Team members still launch HTTP dev script.
- Mitigation: Add explicit scripts and runtime guard warning.

3. Risk: Redirect URI drift in Keycloak after reset.
- Mitigation: Add idempotent Keycloak client config check in setup scripts.

## 8. Rollback Plan

If secure dev mode blocks progress:

1. Keep ingress HTTPS auth validation as the canonical verification path.
2. Temporarily allow HTTP dev for non-auth pages only.
3. Re-enable previous Vite config while preserving Keycloak hardening changes.

## 9. Execution Notes

This plan is designed to directly resolve the currently observed condition: valid credentials + failed browser callback due to auth session cookie continuity.
