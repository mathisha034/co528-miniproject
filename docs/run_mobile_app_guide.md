# Running the DECP Mobile Application

This guide uses runtime configuration via dart-define values. Do not hardcode API or OIDC URLs in source code.

## Prerequisites
1. Backend ingress and Keycloak are reachable.
2. Flutter SDK and Android tooling are installed.
3. Mobile project path:
   ```bash
   cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
   ```

## Required Runtime Keys
Every mobile run must provide:
- APP_ENV
- API_BASE_URL
- OIDC_DISCOVERY_URL
- OIDC_CLIENT_ID
- OIDC_REDIRECT_URI

## Android Emulator Profile
Use this for AVD testing. HTTP is allowed only in emulator mode.

```bash
flutter run \
  -d emulator-5554 \
  --dart-define=APP_ENV=emulator \
  --dart-define=API_BASE_URL=http://10.0.2.2:8080/api/v1 \
  --dart-define=OIDC_DISCOVERY_URL=http://10.0.2.2:8081/realms/miniproject/.well-known/openid-configuration \
  --dart-define=OIDC_CLIENT_ID=mobile-client \
  --dart-define=OIDC_REDIRECT_URI=miniproject://login-callback
```

## Physical Android Device Profile
Use this for real phones. HTTPS is mandatory.

```bash
flutter run \
  -d R52XA09G67W \
  --dart-define=APP_ENV=device \
  --dart-define=API_BASE_URL=https://miniproject.local/api/v1 \
  --dart-define=OIDC_DISCOVERY_URL=https://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration \
  --dart-define=OIDC_CLIENT_ID=mobile-client \
  --dart-define=OIDC_REDIRECT_URI=miniproject://login-callback
```

If miniproject.local is not resolvable/trusted by the phone, use an HTTPS tunnel/domain that the phone can reach and trust, then replace API_BASE_URL and OIDC_DISCOVERY_URL accordingly.

## USB-Only Local Debug Profile (ADB Reverse)
Use this profile for local debugging when phone and laptop networking is unstable. This is a debug-only mode and should not be used for release validation.

1. Ensure adb is available:
   ```bash
   $HOME/Android/Sdk/platform-tools/adb devices
   ```
2. Forward device localhost ports to laptop localhost:
   ```bash
   $HOME/Android/Sdk/platform-tools/adb reverse tcp:8080 tcp:8080
   $HOME/Android/Sdk/platform-tools/adb reverse tcp:8081 tcp:8081
   ```
3. Run app in usb environment (HTTP allowed):
   ```bash
   flutter run \
     -d R52XA09G67W \
     --dart-define=APP_ENV=usb \
     --dart-define=API_BASE_URL=http://127.0.0.1:8080/api/v1 \
     --dart-define=OIDC_DISCOVERY_URL=http://127.0.0.1:8081/realms/miniproject/.well-known/openid-configuration \
     --dart-define=OIDC_CLIENT_ID=mobile-client \
     --dart-define=OIDC_REDIRECT_URI=miniproject://login-callback
   ```

Notes:
- USB profile assumes laptop serves API on port 8080 and Keycloak on port 8081.
- If your API is only available behind ingress on 443, USB reverse is not enough by itself.
- For end-to-end realistic testing, prefer Physical Android Device Profile with HTTPS hostname.

Operational convenience:
- Helper script: `mobile/delta/scripts/run_usb_reverse_debug.sh`
- Example:
   ```bash
   cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
   ./scripts/run_usb_reverse_debug.sh D0AA002418J90610526
   ```

Rollback from USB profile to robust HTTPS profile:
1. Remove USB port mappings:
    ```bash
    $HOME/Android/Sdk/platform-tools/adb reverse --remove-all
    ```
2. Switch APP_ENV back to `device`.
3. Use HTTPS endpoints (`https://miniproject.local/...` or trusted tunnel domain).
4. Re-run with Physical Android Device Profile command above.

## Quick Validation Checklist
1. Login flow opens browser and returns to app.
2. Login does not throw AppAuth HTTP/HTTPS exception.
3. Protected API call succeeds after login.
4. Logout clears session and returns to login screen.

## Troubleshooting
1. Error: only https connections are permitted
   - Cause: OIDC discovery URL is HTTP while APP_ENV is device/release.
   - Fix: provide HTTPS OIDC_DISCOVERY_URL.
2. Browser login succeeds but app callback fails
   - Cause: redirect URI mismatch between app and Keycloak client.
   - Fix: ensure OIDC_REDIRECT_URI matches mobile client settings and Android scheme.
3. Host not reachable from phone
   - Cause: local hostnames not resolvable on device network.
   - Fix: use routable HTTPS hostname or tunnel.
