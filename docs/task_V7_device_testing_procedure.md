# Task 4 & 8: Mobile Device Testing Procedure

**Purpose:** Validate complete end-to-end auth flow and protected API access on physical Android device.

**Prerequisites:**
1. Kubernetes cluster must be running and miniproject namespace accessible
2. Keycloak at miniproject.local must be reachable from external network
3. Backend services (user-service, feed-service, etc.) must be available
4. Physical device (SM X510, R52XA09G67W) connected via USB with USB debugging enabled
5. App already built once without errors

**Device Preparation:**
```bash
# Verify device is connected and accessible
cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
flutter devices

# Output should include: SM X510 • R52XA09G67W • android-arm64 • Android 16
```

## Phase 1: Infrastructure Verification (Pre-Device Testing)

**From Workstation:**

```bash
# 1. Verify cluster reachability
kubectl get pods -n miniproject

# 2. Verify Keycloak OIDC endpoint reachable
curl -ksS https://miniproject.local/.well-known/openid-configuration | jq -r '.issuer'

# 3. Verify authorization endpoint reachable
curl -ksS https://miniproject.local/.well-known/openid-configuration | jq -r '.authorization_endpoint'

# 4. Verify token endpoint reachable
curl -ksS https://miniproject.local/.well-known/openid-configuration | jq -r '.token_endpoint'

# Expected output: All endpoints return valid HTTPS URLs in miniproject.local domain
```

**From Physical Device (Mobile Hotspot or LAN):**

```bash
# SSH/ADB shell into device and verify DNS resolution
adb shell
nslookup miniproject.local

# Expected: miniproject.local resolves to accessible IP with HTTPS reachability
```

---

## Phase 2: Application Launch and Login Flow (Task 4)

**Step 1: Clean Install**

```bash
cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta

# Uninstall previous version if present
flutter uninstall -d R52XA09G67W

# Launch app with device profile
flutter run \
  -d R52XA09G67W \
  --dart-define=APP_ENV=device \
  --dart-define=API_BASE_URL=https://miniproject.local/api/v1 \
  --dart-define=OIDC_DISCOVERY_URL=https://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration \
  --dart-define=OIDC_CLIENT_ID=mobile-client \
  --dart-define=OIDC_REDIRECT_URI=miniproject://login-callback

# Expected output: App installs and opens login screen (no crashes or HTTPS errors)
```

**Step 2: Capture Device Logs**
```bash
# In new terminal, capture device logs during login
adb logcat -c
adb logcat E/AppAuth:* E/*:S | tee /tmp/device_login_logs.txt &

# Keep this running during login attempt
```

**Step 3: Perform Login**

1. Tap "Login with Keycloak" button in app
2. System browser opens to Keycloak login page
3. Enter test credentials: `e2e_admin` / `pass123`
4. Browser shows authorization consent screen
5. Tap "Accept" to grant mobile-client access
6. Browser redirects back to app via miniproject://login-callback (inspect logs for callback receipt)
7. App displays home screen (success) or login screen with error (failure)

**Step 4: Verify Login Success**

```bash
# Verify auth state in system logs
adb logcat | grep -i "callback\|auth\|token\|login"

# Expected patterns:
# - "Received intent action: miniproject://login-callback"
# - No "E/AppAuth: Network error" messages
# - Token successfully persisted to secure storage
```

**Step 5: Stop log capture**
```bash
pkill -f "adb logcat"
```

---

## Phase 3: Protected API Access Validation (Task 4 continuation)

**Step 1: From Device, Access Protected Resource**

1. After successful login, app shows home screen
2. Tap any protected screen (Feed, Profile, Research, Jobs, Notifications, Analytics, Infrastructure)
3. App should display content from protected API endpoints

**Step 2: Verify API Token Injection**

```bash
# From workstation, monitor backend request logging
kubectl logs -n miniproject deployment/user-service -f | grep -i "authorization\|bearer\|token" &

# While app fetches data on device, check logs for:
# - Valid Authorization: Bearer header format
# - No 401 "Unauthorized" responses
```

**Step 3: Validate Token Lifecycle**

In app, perform these actions and verify success:

1. **Fresh Token Access:** Navigate to multiple protected screens immediately after login
   - Expected: All requests succeed (200s, not 401)

2. **Token Refresh:** Wait ~5 minutes until token approaches expiry (30s pre-expiry buffer triggers refresh)
   - Expected: Background refresh succeeds, continued API access works

3. **Session Persistence:** Kill app and relaunch within token TTL
   - Expected: App restores login state without re-authenticating, protected access works

4. **Expired Token:** Let token expire completely (typically > 5 min)
   - Expected: App detects expired token, redirects to login screen automatically

**Step 4: Verify Logs for Token Refresh**

```bash
adb logcat | grep -i "refresh\|token\|valid"

# Expected patterns:
# - "Checking token expiry"
# - "Token refresh triggered" (if near expiry)
# - "Access token valid" or similar
```

---

## Phase 4: Logout and Session Cleanup (Task 4 continuation)

**Step 1: Perform Logout**

1. Tap "Logout" in app (usually Profile or menu)
2. Verify secure storage is cleared
3. Verify app returns to login screen with no residual token

**Step 2: Verify Logout Success**

```bash
# From device logs
adb logcat | grep -i "logout\|clear\|session"

# Expected patterns:
# - "Token cleared from secure storage"
# - "Session invalidated"
# - No lingering auth tokens in logs
```

**Step 3: Attempt Protected Access After Logout**

1. From login screen, directly navigate to a protected URL (if deep-linking available)
2. Expected: App redirects to login, not to protected screen

---

## Phase 5: Evidence Collection (Task 8)

**Automated Collection Script:**

```bash
#!/bin/bash

# Create evidence directory
EVIDENCE_DIR="/tmp/task_8_evidence_$(date +%s)"
mkdir -p "$EVIDENCE_DIR"

echo "=== Device Testing Evidence Collection ===" | tee "$EVIDENCE_DIR/README.md"
echo "Collected: $(date)" >> "$EVIDENCE_DIR/README.md"
echo "" >> "$EVIDENCE_DIR/README.md"

# 1. Flutter analyze
echo "### Static Analysis Results" >> "$EVIDENCE_DIR/README.md"
cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
flutter analyze > "$EVIDENCE_DIR/flutter_analyze.txt" 2>&1
echo "✓ Analyzer output saved" | tee -a "$EVIDENCE_DIR/README.md"

# 2. Flutter test
echo "" >> "$EVIDENCE_DIR/README.md"
echo "### Unit Test Results" >> "$EVIDENCE_DIR/README.md"
flutter test > "$EVIDENCE_DIR/flutter_test.txt" 2>&1
echo "✓ Test output saved" | tee -a "$EVIDENCE_DIR/README.md"

# 3. Device list
echo "" >> "$EVIDENCE_DIR/README.md"
echo "### Device Information" >> "$EVIDENCE_DIR/README.md"
flutter devices > "$EVIDENCE_DIR/flutter_devices.txt" 2>&1
echo "✓ Device list saved" | tee -a "$EVIDENCE_DIR/README.md"

# 4. Infrastructure checks
echo "" >> "$EVIDENCE_DIR/README.md"
echo "### Infrastructure Checks" >> "$EVIDENCE_DIR/README.md"
echo "Cluster Status:" >> "$EVIDENCE_DIR/README.md"
kubectl get pods -n miniproject >> "$EVIDENCE_DIR/infrastructure_checks.txt" 2>&1
echo "OIDC Endpoint:" >> "$EVIDENCE_DIR/README.md"
curl -ksS https://miniproject.local/.well-known/openid-configuration | jq -r '.issuer' >> "$EVIDENCE_DIR/infrastructure_checks.txt" 2>&1
echo "✓ Infrastructure checks saved" | tee -a "$EVIDENCE_DIR/README.md"

# 5. Print summary
echo "" >> "$EVIDENCE_DIR/README.md"
echo "## Manual Device Testing Checklist" >> "$EVIDENCE_DIR/README.md"
echo "- [ ] Device login successful (no HTTPS errors)" >> "$EVIDENCE_DIR/README.md"
echo "- [ ] Browser redirects back to app with token" >> "$EVIDENCE_DIR/README.md"
echo "- [ ] Protected API calls succeed with token" >> "$EVIDENCE_DIR/README.md"
echo "- [ ] Token refresh works after expiry" >> "$EVIDENCE_DIR/README.md"
echo "- [ ] Logout clears session" >> "$EVIDENCE_DIR/README.md"
echo "- [ ] Post-logout, login screen is enforced" >> "$EVIDENCE_DIR/README.md"

echo ""
echo "Evidence collected in: $EVIDENCE_DIR"
```

Save this script as `/tmp/collect_evidence.sh` and run after device testing:

```bash
bash /tmp/collect_evidence.sh
```

---

## Phase 6: Verification Checklist (Task 4 Acceptance Criteria)

- [ ] **Prerequisite 1:** Cluster reachable (`kubectl get pods -n miniproject` succeeds)
- [ ] **Prerequisite 2:** OIDC endpoint reachable (`curl -ks https://miniproject.local/.well-known/openid-configuration` returns 200)
- [ ] **Test 1:** App launches with `APP_ENV=device` profile without HTTPS errors
- [ ] **Test 2:** Login flow opens browser and returns with valid token
- [ ] **Test 3:** Protected API calls succeed with injected bearer token
- [ ] **Test 4:** Token refresh works within app lifetime
- [ ] **Test 5:** Logout clears session and enforces login screen
- [ ] **Test 6:** Post-logout, unauthenticated redirect to login works

---

## Phase 7: Task 8 Verification Checklist

- [ ] `flutter analyze` shows 0 warnings (19 infos are acceptable - deprecated API usage)
- [ ] `flutter test` passes all 38 unit tests
- [ ] Device login successful and callback received (logs show no HTTPS errors)
- [ ] Protected API access with bearer token succeeds
- [ ] Token lifecycle (fresh, refresh, expiry) validated via app and logs
- [ ] Logout and re-login flow works end-to-end
- [ ] No hardcoded endpoints in source code
- [ ] All config consumed from `dart-define` parameters

---

## When Infrastructure is Down (Current State)

This document is pre-created for execution when infrastructure is restored.

**Current Status (2026-03-18 T+5h):**
- ✓ Code changes complete (Tasks 1-3, 5-7)
- ✓ Unit tests passing (38/38)
- ✓ Analyzer clean (0 warnings)
- ✗ Infrastructure unreachable (cluster + ingress down)
- ⏳ Device testing blocked until infrastructure is restored

**To Resume Execution:**
1. Verify cluster is alive: `kubectl get pods -n miniproject`
2. Verify OIDC endpoint: `curl -ks https://miniproject.local/.well-known/openid-configuration`
3. Run Phase 1 (Infrastructure Verification)
4. Run Phase 2-4 (Device Testing) using the exact commands above
5. Run Phase 5 (Evidence Collection) script
6. Verify all 12 checkboxes in Phase 6 & 7

---

## Troubleshooting Reference

| Issue | Symptom | Fix |
|-------|---------|-----|
| E/AppAuth: Network error | OIDC endpoint unreachable from device | Verify miniproject.local is resolvable and HTTPS accessible from device network |
| Browser doesn't redirect to app | miniproject://login-callback not registered | Verify Android manifest includes scheme intent filter |
| 401 Unauthorized on protected API | Token not injected in Authorization header | Check Dio interceptor logs; ensure AppConfig consumed correctly |
| Token refresh fails | App shows "Session expired" after ~5 min | Verify refresh token persisted; check Keycloak refresh endpoint reachability |
| Logout button missing | App doesn't show logout option | Check if profile screen or settings menu contains logout action |

---

## Supporting Documentation
- [Run Mobile App Guide](run_mobile_app_guide.md)
- [AppConfig Module](../mobile/delta/lib/core/config/app_config.dart)
- [AuthRepository](../mobile/delta/lib/features/auth/repositories/auth_repository.dart)
- [Dio Client](../mobile/delta/lib/core/network/dio_client.dart)
- [Router Guards](../mobile/delta/lib/core/router/app_router.dart)
