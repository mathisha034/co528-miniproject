# Implementation Plan V7.0: Mobile Auth Runtime Hardening

## 1. Objective
Stabilize Flutter mobile authentication on emulator and physical Android devices by removing insecure and device-specific assumptions, then harden session handling and navigation guards.

Primary failure to solve now:
- Physical-device crash in `flutter_appauth` with `IllegalArgumentException: only https connections are permitted`.

## 2. Scope
In scope:
- Mobile auth endpoint configuration and OIDC discovery flow.
- Mobile API base URL configuration and TLS-safe defaults.
- Android deep-link and runtime compatibility checks.
- Auth/session lifecycle hardening and guarded navigation.
- Static quality fixes found during audit.

Out of scope:
- Backend realm redesign.
- Full mobile UI redesign.

## 3. Evidence Baseline (Pre-Implementation)
Collected on 2026-03-18 in `mobile/delta`:

1. `flutter analyze` result: 25 issues (1 warning + 24 info).
   - Warning: duplicate import in `lib/features/profile/presentation/profile_screen.dart`.
   - Info items include deprecated `withOpacity`, `avoid_print`, nullable final, and local underscore naming.
2. `flutter test` result: all tests passed.
3. Code findings:
   - `lib/features/auth/repositories/auth_repository.dart` hardcodes:
     - `http://10.0.2.2:8081/.../.well-known/openid-configuration` (emulator-only + HTTP).
   - `lib/core/network/dio_client.dart` hardcodes:
     - `http://miniproject.local/api/v1` (HTTP + host assumptions unsuitable for physical devices).
   - `lib/features/profile/presentation/profile_screen.dart` contains duplicate `go_router` import.

Conclusion: Current implementation cannot reliably work on physical devices and is brittle even on emulator due to non-portable hardcoded URLs.

## 4. Root Cause Analysis
### 4.1 Immediate Crash Root Cause
`flutter_appauth` enforces secure OIDC metadata retrieval; HTTP discovery endpoints are rejected.

### 4.2 Architectural Root Causes
- Hardcoded network topology (`10.0.2.2`, `miniproject.local`) in app source.
- No environment profile separation (emulator vs physical vs release).
- Session validity check is token presence-only; no expiry/refresh policy.
- Router does not enforce authenticated route gating.

## 5. Target Architecture
### 5.1 Environment-Driven Runtime Config
Introduce a single runtime config layer sourced via `--dart-define`:
- `API_BASE_URL`
- `OIDC_ISSUER` or `OIDC_DISCOVERY_URL`
- `OIDC_CLIENT_ID`
- `OIDC_REDIRECT_URI`
- `APP_ENV` (`emulator`, `device`, `release`)

### 5.2 Security Posture
- HTTPS mandatory for OIDC discovery and API base URL in device/release.
- Optional debug-only exception path (if ever needed) must be explicit and disallowed in release.
- Fail fast with actionable error messages when config is invalid.

### 5.3 Auth Lifecycle
- Persist access/refresh/id tokens with metadata (`expiresAt`).
- Add refresh flow before protected API calls or on 401 retry path.
- Ensure logout clears storage and completes end-session safely.

### 5.4 Navigation Policy
- Add router redirect guard:
  - Unauthenticated users cannot access protected routes.
  - Authenticated users are redirected away from login root.

## 6. Phased Implementation
### Phase A: Config and Connectivity Foundation
1. Create `AppConfig` for typed runtime variables with validation.
2. Replace hardcoded URLs in auth and Dio client with config values.
3. Add environment presets to README/scripts for emulator and physical device.

Exit criteria:
- No hardcoded OIDC/API URLs in source.
- App boot fails with clear errors when required variables are missing/invalid.

### Phase B: Auth Flow Hardening
1. Refactor `AuthRepository` to use config and structured logging.
2. Enforce HTTPS discovery in non-emulator modes.
3. Add token expiry tracking and refresh path.

Exit criteria:
- Login succeeds on emulator and physical device with HTTPS discovery.
- Token refresh path validated by unit tests.

### Phase C: Route Protection and Session UX
1. Add router-level auth guards.
2. Standardize logout/login redirects.
3. Add startup session restore check.

Exit criteria:
- Manual navigation bypass to protected routes is blocked when unauthenticated.

### Phase D: Quality and Regression Stabilization
1. Fix analyzer warning and high-value infos (`avoid_print`, duplicate import, nullable final).
2. Optionally batch-replace deprecated `withOpacity` calls in touched files.
3. Run full verification matrix.

Exit criteria:
- `flutter analyze` has no warnings.
- Existing tests still pass.

## 7. Verification Matrix (Must Pass)
1. Static checks:
   - `flutter analyze`
2. Unit tests:
   - `flutter test`
   - Add/execute new tests for config validation and token refresh paths.
3. Device auth checks:
   - Emulator login flow success.
   - Physical-device login flow success.
   - Protected API request returns 200 with bearer token.
4. Negative checks:
   - Invalid/missing `--dart-define` values produce explicit startup/auth errors.
   - HTTP OIDC discovery rejected by app validation before AppAuth call.

## 8. Risks and Mitigations
- Risk: LAN TLS setup/trust complexity on physical phone.
  - Mitigation: provide two supported profiles (trusted HTTPS DNS vs tunnel URL) and exact run commands.
- Risk: Refresh implementation introduces auth regressions.
  - Mitigation: unit tests for refresh success/failure and storage updates.
- Risk: Environment drift between developers.
  - Mitigation: checked-in example run commands and config docs.

## 9. Definition of Done
- Physical-device auth crash resolved.
- Emulator and physical login both pass.
- Protected API calls pass with refreshed token lifecycle.
- Route guard behavior verified.
- Analyzer warning cleared and tests green.
- Task log and evidence updated.
