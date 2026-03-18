#!/usr/bin/env bash
set -euo pipefail

# Purpose:
# - Fast local USB debugging when LAN/DNS/TLS are unstable.
# - Keeps runtime config isolated in APP_ENV=usb so rollback to robust HTTPS mode is simple.
#
# Rollback to robust mode:
# - Stop this script.
# - Clear reverse rules: adb reverse --remove-all
# - Run device profile with HTTPS endpoints from docs/run_mobile_app_guide.md.

DEVICE_ID="${1:-}"
ADB_BIN="${ADB_BIN:-$HOME/Android/Sdk/platform-tools/adb}"

if [[ ! -x "$ADB_BIN" ]]; then
  echo "adb not found at $ADB_BIN"
  echo "Set ADB_BIN or install Android platform-tools."
  exit 1
fi

if [[ -n "$DEVICE_ID" ]]; then
  ADB_DEVICE_ARG=("-s" "$DEVICE_ID")
  FLUTTER_DEVICE_ARG=("-d" "$DEVICE_ID")
else
  ADB_DEVICE_ARG=()
  FLUTTER_DEVICE_ARG=()
fi

echo "Setting up adb reverse for API (8080) and Keycloak (8081)..."
"$ADB_BIN" "${ADB_DEVICE_ARG[@]}" reverse tcp:8080 tcp:8080
"$ADB_BIN" "${ADB_DEVICE_ARG[@]}" reverse tcp:8081 tcp:8081
echo "adb reverse active: device localhost:8080/8081 -> laptop localhost:8080/8081"

echo "Running USB mode preflight checks on laptop localhost endpoints..."
if API_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/v1/health)"; then
  :
else
  API_STATUS="unreachable"
fi

if OIDC_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/realms/miniproject/.well-known/openid-configuration)"; then
  :
else
  OIDC_STATUS="unreachable"
fi

echo "preflight.api_local_8080=$API_STATUS"
echo "preflight.oidc_local_8081=$OIDC_STATUS"

if [[ "$API_STATUS" != "200" ]]; then
  echo "ERROR: API is not reachable on http://127.0.0.1:8080/api/v1/health"
  echo "USB mode requires laptop API to be exposed on localhost:8080."
  echo "Suggested actions:"
  echo "  1) Start local API binding on :8080, or"
  echo "  2) Switch to robust HTTPS device profile from docs/run_mobile_app_guide.md"
  exit 2
fi

if [[ "$OIDC_STATUS" != "200" ]]; then
  echo "ERROR: OIDC discovery is not reachable on http://127.0.0.1:8081/..."
  echo "USB mode requires Keycloak discovery on localhost:8081."
  echo "Suggested actions:"
  echo "  1) Start/forward Keycloak on :8081, or"
  echo "  2) Switch to robust HTTPS device profile from docs/run_mobile_app_guide.md"
  exit 3
fi

echo "Starting Flutter app in USB debug profile..."
flutter run "${FLUTTER_DEVICE_ARG[@]}" \
  --dart-define=APP_ENV=usb \
  --dart-define=API_BASE_URL=http://127.0.0.1:8080/api/v1 \
  --dart-define=OIDC_DISCOVERY_URL=http://127.0.0.1:8081/realms/miniproject/.well-known/openid-configuration \
  --dart-define=OIDC_CLIENT_ID=mobile-client \
  --dart-define=OIDC_REDIRECT_URI=miniproject://login-callback

echo "To rollback reverse mappings: $ADB_BIN ${ADB_DEVICE_ARG[*]:-} reverse --remove-all"
