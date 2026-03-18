# Task List - V6 Auth Session Stability

Date: 2026-03-18
Derived From: implementation_plan_v6_auth_session_stability.md
Status: Completed

## Stage Gate 0 - Mandatory Tests Before Proceeding

- [x] G0.1 Verify token baseline for e2e_student/e2e_alumni/e2e_admin is HTTP 200
- [x] G0.2 Verify Keycloak currently logs cookie_not_found (problem reproduced)
- [x] G0.3 Verify current localhost auth origin is HTTP-only in active dev setup
- [x] G0.4 Capture timestamped baseline snapshot in restoration evidence log

Rule: Do not execute Task Group B onward until Stage Gate 0 is fully complete.

## Task Group A - Baseline and Diagnostics

- [x] A1. Validate e2e credential token flow (student, alumni, admin)
- [x] A2. Verify insecure localhost origin is active (HTTP) and secure localhost is unavailable
- [x] A3. Confirm Keycloak log evidence contains cookie_not_found

Deliverable: confirmed root cause baseline.

## Task Group B - Secure Dev Origin Implementation

- [x] B1. Update Vite dev server to support HTTPS on dedicated secure port (5174)
- [x] B2. Add/verify local TLS cert configuration for dev server
- [x] B3. Add npm script for secure dev startup
- [x] B4. Verify frontend launches at https://localhost:5174

Validation:
- curl https://localhost:5174 responds successfully

## Task Group C - Keycloak Client Configuration Hardening

- [x] C1. Inspect react-web-app redirectUris and webOrigins
- [x] C2. Keep only required secure redirect URIs for auth flows
- [x] C3. Ensure https://localhost:5174/* and https://miniproject.local/* are present
- [x] C4. De-scope http://localhost:5173/* from login-required verification path

Validation:
- Keycloak admin API returns expected client config.

## Task Group D - Frontend Runtime Guardrails

- [x] D1. Add insecure-origin guard in auth initialization path
- [x] D2. Show explicit actionable error when launched on HTTP origin
- [x] D3. Keep relative /auth endpoint behavior unchanged

Validation:
- HTTP origin displays guard message and avoids broken auth loop.

## Task Group E - End-to-End Verification

- [x] E1. Browser login smoke with e2e_admin/pass123 on HTTPS origin
- [x] E2. Navigate dashboard -> profile -> notifications -> feed -> jobs -> events
- [x] E3. Repeat login check with e2e_student/pass123 and e2e_alumni/pass123
- [x] E4. Verify no new cookie_not_found during test interval
- [x] E5. Execute 3 consecutive login attempts for e2e_admin on HTTPS origin
- [x] E6. Validate protected API success after each successful callback

Validation:
- All flow steps pass and Keycloak logs remain clean for the test window.

## Task Group G - Regression and Negative Testing

- [x] G1. Negative test: run HTTP origin and confirm guardrail warning appears
- [x] G2. Negative test: confirm no infinite redirect loop on insecure origin
- [x] G3. Regression test: verify Keycloak logs remain free of cookie_not_found for HTTPS flow window
- [x] G4. Stability test: repeat full smoke flow for at least two distinct e2e users

Validation:
- Negative path is controlled and expected.
- Secure path remains stable across repeated runs.

## Task Group F - Documentation and Handover

- [x] F1. Update getting started docs with HTTPS-first login path
- [x] F2. Append implementation evidence to system restoration log
- [x] F3. Update known issues tracker as resolved with evidence

Validation:
- Docs include commands, results, and final status.

## Exit Criteria

1. Successful browser login and route flow on HTTPS origin for all 3 e2e users.
2. No cookie_not_found during verified test window.
3. Updated docs and issue records committed.
