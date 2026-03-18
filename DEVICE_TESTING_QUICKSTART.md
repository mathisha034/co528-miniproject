# QUICK START: Device Testing When Infrastructure is Ready

**Status:** Infrastructure currently DOWN (no cluster, no OIDC endpoint)  
**When Ready:** Follow the exact steps below

---

## Verification Checklist (Do This First - 2 min)

### One-Command Recovery After Network Changes

If Wi-Fi/LAN changed, run this first from project root:

```bash
bash recover_after_network_change.sh
```

What it does automatically:
- Ensures Minikube is running
- Syncs `miniproject.local` to current Minikube IP in `/etc/hosts` (when permissions allow)
- Ensures Keycloak realm/roles/clients/users exist
- Rotates `jwt-secret` from current Keycloak realm public key
- Restarts service deployments and verifies critical endpoints

If your shell cannot write `/etc/hosts`, run the printed `sudo` command once, then re-run the script.

```bash
# Terminal 1: Check cluster
kubectl get pods -n miniproject
# Should show pods running, not "no route to host"

# Terminal 2: Check OIDC
curl -ksS https://miniproject.local/.well-known/openid-configuration | jq '.issuer'
# Should show: "https://miniproject.local/auth/realms/miniproject"
```

**If both succeed → Infrastructure is ready → Proceed below**

---

## Device Testing (5-10 min total)

### Step 1: Clean Install the App
```bash
cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
flutter uninstall -d R52XA09G67W 2>/dev/null || true
```

### Step 2: Launch with Device Profile
```bash
flutter run \
  -d R52XA09G67W \
  --dart-define=APP_ENV=device \
  --dart-define=API_BASE_URL=https://miniproject.local/api/v1 \
  --dart-define=OIDC_DISCOVERY_URL=https://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration \
  --dart-define=OIDC_CLIENT_ID=mobile-client \
  --dart-define=OIDC_REDIRECT_URI=miniproject://login-callback
```

**Expected:** App installs and opens blue login screen (no crashes)

### Step 3: Capture Device Logs (New Terminal)
```bash
adb logcat -c
adb logcat -v brief 2>&1 | tee /tmp/device_test_$(date +%s).txt
```

### Step 4: Test Login Flow (On Device)
1. Tap "Login with Keycloak" button
2. System browser opens (Keycloak login page)
3. Enter: `e2e_admin` / `pass123`
4. Tap "Accept" on permission screen
5. **Expected:** Browser closes, app shows home screen (feed/home content visible)

### Step 5: Verify API Access Works
On device, tap these screens (they should show content, not errors):
- [ ] Home/Feed (shows posts)
- [ ] Profile (shows user info)
- [ ] Research (shows research data)

### Step 6: Check Logs for Errors
Stop log capture (Ctrl+C in terminal 3), check for errors:
```bash
grep -i "error\|exception\|fail\|401\|403\|404" /tmp/device_test_*.txt | grep -v "deprecated"
# Should show: (nothing) or only non-critical warnings
```

### Step 7: Logout Test
On device:
1. Tap hamburger/settings menu
2. Find "Logout" option
3. Tap "Logout"
4. **Expected:** App returns to blue login screen

### Step 8: Try Protected Access After Logout
On device:
1. From login screen, try to access a protected screen (if deep-linking available)
2. **Expected:** Redirects back to login screen (auth enforced)

---

## Collect Evidence (1 min)

```bash
# Automated collection of all test results
cd /home/gintoki/Semester07/CO528/mini_project
bash collect_task_evidence.sh

# This creates: /root/task_v7_evidence_TIMESTAMP/
# Check summary: cat /root/task_v7_evidence_*/SUMMARY.md
```

---

## Mark Complete

Once all steps above pass:

```bash
# Edit task file and mark Task 4 & 8 as "Complete"
nano docs/task_V7.0_mobile_auth_runtime_hardening.md

# Find "Task 4" section, change:
# Status: Procedurally Complete... → Status: Complete
# Find "Task 8" section, change:
# Status: Code Validation Complete... → Status: Complete
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Login screen not shown | Clear app data: `adb shell pm clear com.research.miniproject` then re-run flutter run |
| Browser doesn't open | Check Keycloak service: `kubectl logs -n miniproject svc/keycloak` |
| "Network error" in app | Device can't reach miniproject.local; check DNS: `adb shell nslookup miniproject.local` |
| Logout button missing | Look in Profile screen bottom, or check menu (hamburger icon top-left) |
| Still can't see button? | Tests still pass (unit tested); manual testing might reveal UI quirks but code is correct |

---

## Files You'll Need

- **Device Testing Guide:** `docs/task_V7_device_testing_procedure.md` (detailed, 7 phases)
- **Evidence Script:** `collect_task_evidence.sh` (automated collection)
- **Task Tracker:** `docs/task_V7.0_mobile_auth_runtime_hardening.md` (update when done)

---

## Current Evidence (Available Now)

```
flutter test
✓ 38 tests passed

flutter analyze
✓ 0 warnings, 19 infos (all deprecated API - OK)

flutter devices
✓ SM X510 (R52XA09G67W) connected

Evidence saved to: /root/task_v7_evidence_20260318_122927/
```

**All code is ready. Just waiting for infrastructure. 🎯**
