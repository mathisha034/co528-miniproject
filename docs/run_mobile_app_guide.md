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
