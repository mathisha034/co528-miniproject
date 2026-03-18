#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="miniproject"
HOSTNAME_ENTRY="miniproject.local"
REALM="miniproject"
MINIKUBE_DRIVER="${MINIKUBE_DRIVER:-}"

SKIP_HOSTS=0
SKIP_KEYCLOAK_BOOTSTRAP=0
SKIP_JWT_SYNC=0

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*"
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --skip-hosts                Skip /etc/hosts sync for ${HOSTNAME_ENTRY}
  --skip-keycloak-bootstrap   Skip Keycloak realm/client/bootstrap checks
  --skip-jwt-sync             Skip jwt-secret public key rotation and restarts
  --driver <name>             Minikube driver (overrides MINIKUBE_DRIVER env)
  -h, --help                  Show this help

Examples:
  bash $(basename "$0")
  bash $(basename "$0") --driver=virtualbox
  bash $(basename "$0") --skip-jwt-sync
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-hosts)
      SKIP_HOSTS=1
      shift
      ;;
    --skip-keycloak-bootstrap)
      SKIP_KEYCLOAK_BOOTSTRAP=1
      shift
      ;;
    --skip-jwt-sync)
      SKIP_JWT_SYNC=1
      shift
      ;;
    --driver=*)
      MINIKUBE_DRIVER="${1#*=}"
      shift
      ;;
    --driver)
      shift
      [[ $# -gt 0 ]] || die "--driver requires a value"
      MINIKUBE_DRIVER="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

need_cmd minikube
need_cmd kubectl
need_cmd curl
need_cmd base64
need_cmd python3

ensure_minikube_running() {
  local status
  status="$(minikube status --format '{{.Host}} {{.Kubelet}} {{.APIServer}}' 2>/dev/null || true)"
  if [[ "$status" != "Running Running Running" ]]; then
    log "Minikube is not fully running (status: ${status:-unknown}). Starting..."
    if [[ -n "$MINIKUBE_DRIVER" ]]; then
      minikube start --driver="$MINIKUBE_DRIVER"
    else
      minikube start
    fi
  else
    log "Minikube is running."
  fi

  kubectl config use-context minikube >/dev/null 2>&1 || true
}

sync_hosts_entry() {
  local minikube_ip tmpfile
  minikube_ip="$1"

  if [[ "$SKIP_HOSTS" -eq 1 ]]; then
    warn "Skipping /etc/hosts sync as requested."
    return
  fi

  tmpfile="$(mktemp)"
  awk -v ip="$minikube_ip" -v host="$HOSTNAME_ENTRY" '
    $0 !~ "(^|[[:space:]])" host "([[:space:]]|$)" { print }
    END { print ip " " host }
  ' /etc/hosts > "$tmpfile"

  if [[ -w /etc/hosts ]]; then
    cp "$tmpfile" /etc/hosts
    log "Updated /etc/hosts: ${HOSTNAME_ENTRY} -> ${minikube_ip}"
  elif command -v sudo >/dev/null 2>&1; then
    # Prompting for sudo here makes the script self-healing when run manually.
    sudo cp "$tmpfile" /etc/hosts
    log "Updated /etc/hosts via sudo: ${HOSTNAME_ENTRY} -> ${minikube_ip}"
  else
    warn "No permission to update /etc/hosts and sudo is unavailable."
  fi

  rm -f "$tmpfile"
}

wait_for_keycloak() {
  kubectl -n "$NAMESPACE" get statefulset keycloak >/dev/null
  kubectl -n "$NAMESPACE" rollout status statefulset/keycloak --timeout=240s >/dev/null
}

kc_pod() {
  kubectl -n "$NAMESPACE" get pod -l app=keycloak -o jsonpath='{.items[0].metadata.name}'
}

kc_exec() {
  local pod="$1"
  shift
  kubectl -n "$NAMESPACE" exec "$pod" -- /opt/keycloak/bin/kcadm.sh "$@"
}

kc_login() {
  local pod="$1" user="$2" pass="$3"
  local attempts=0

  until kc_exec "$pod" config credentials --server "http://localhost:8080/auth" --realm master --user "$user" --password "$pass" >/dev/null 2>&1 || \
        kc_exec "$pod" config credentials --server "http://localhost:8080" --realm master --user "$user" --password "$pass" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 30 ]]; then
      die "Keycloak admin login failed after 150 seconds."
    fi
    sleep 5
  done
}

ensure_realm_roles_clients() {
  local pod="$1"

  kc_client_exists() {
    local client_id="$1"
    kc_exec "$pod" get clients -r "$REALM" -q "clientId=${client_id}" \
      | python3 -c 'import json,sys
arr=json.load(sys.stdin)
print("yes" if arr else "no")'
  }

  if ! kc_exec "$pod" get "realms/${REALM}" >/dev/null 2>&1; then
    log "Creating missing realm: ${REALM}"
    kc_exec "$pod" create realms -s "realm=${REALM}" -s enabled=true >/dev/null
  else
    log "Realm ${REALM} already exists."
  fi

  for role in student alumni admin; do
    if ! kc_exec "$pod" get "roles/${role}" -r "$REALM" >/dev/null 2>&1; then
      log "Creating role: ${role}"
      kc_exec "$pod" create roles -r "$REALM" -s "name=${role}" >/dev/null
    fi
  done

  if [[ "$(kc_client_exists react-web-app)" != "yes" ]]; then
    log "Creating missing client: react-web-app"
    kc_exec "$pod" create clients -r "$REALM" \
      -s clientId=react-web-app \
      -s enabled=true \
      -s publicClient=true \
      -s standardFlowEnabled=true \
      -s directAccessGrantsEnabled=true \
      -s 'redirectUris=["https://localhost:5174/*","https://localhost:5173/*","https://miniproject.local/*"]' \
      -s 'webOrigins=["https://localhost:5174","https://localhost:5173","https://miniproject.local"]' \
      >/dev/null
  fi

  if [[ "$(kc_client_exists mobile-client)" != "yes" ]]; then
    log "Creating missing client: mobile-client"
    kc_exec "$pod" create clients -r "$REALM" \
      -s clientId=mobile-client \
      -s enabled=true \
      -s publicClient=true \
      -s standardFlowEnabled=true \
      -s directAccessGrantsEnabled=true \
      -s 'redirectUris=["miniproject://login-callback","https://miniproject.local/*"]' \
      -s 'webOrigins=["https://miniproject.local"]' \
      >/dev/null
  fi

  if [[ "$(kc_client_exists e2e-test-client)" != "yes" ]]; then
    log "Creating missing client: e2e-test-client"
    kc_exec "$pod" create clients -r "$REALM" \
      -s clientId=e2e-test-client \
      -s enabled=true \
      -s publicClient=true \
      -s directAccessGrantsEnabled=true \
      >/dev/null
  fi

  # Keep test runs stable in longer sessions.
  kc_exec "$pod" update "realms/${REALM}" -s accessTokenLifespan=3600 >/dev/null || true
}

kc_get_user_id() {
  local pod="$1" username="$2"
  kc_exec "$pod" get users -r "$REALM" -q "username=${username}" \
    | python3 -c 'import json,sys
arr=json.load(sys.stdin)
print(arr[0]["id"] if arr else "")'
}

ensure_e2e_user() {
  local pod="$1" username="$2" email="$3" first_name="$4" last_name="$5" role="$6"
  local user_id

  user_id="$(kc_get_user_id "$pod" "$username")"
  if [[ -z "$user_id" ]]; then
    log "Creating Keycloak user: ${username}"
    kc_exec "$pod" create users -r "$REALM" \
      -s "username=${username}" \
      -s "enabled=true" \
      -s "email=${email}" \
      -s "firstName=${first_name}" \
      -s "lastName=${last_name}" \
      >/dev/null
    user_id="$(kc_get_user_id "$pod" "$username")"
  fi

  [[ -n "$user_id" ]] || die "Failed to get user id for ${username}"

  kc_exec "$pod" set-password -r "$REALM" --username "$username" --new-password pass123 >/dev/null
  kc_exec "$pod" add-roles -r "$REALM" --uusername "$username" --rolename "$role" >/dev/null || true
}

ensure_e2e_users() {
  local pod="$1"
  ensure_e2e_user "$pod" "e2e_student" "ashan@e2e.test" "Ashan" "Kumar" "student"
  ensure_e2e_user "$pod" "e2e_alumni" "nimali@e2e.test" "Nimali" "Perera" "alumni"
  ensure_e2e_user "$pod" "e2e_admin" "dr.raj@e2e.test" "Dr" "Rajapaksha" "admin"
}

sync_jwt_secret_and_restart() {
  local minikube_ip="$1"
  local public_key public_key_pem realm_json

  realm_json="$(curl -ksS --resolve "${HOSTNAME_ENTRY}:443:${minikube_ip}" "https://${HOSTNAME_ENTRY}/auth/realms/${REALM}" || true)"
  if [[ -z "$realm_json" ]]; then
    realm_json="$(curl -ksS --resolve "${HOSTNAME_ENTRY}:443:${minikube_ip}" "https://${HOSTNAME_ENTRY}/realms/${REALM}" || true)"
  fi

  public_key="$(printf '%s' "$realm_json" | python3 -c 'import json,sys
try:
    doc=json.load(sys.stdin)
    print(doc.get("public_key",""))
except Exception:
    print("")')"

  if [[ -z "$public_key" ]]; then
    warn "Could not extract Keycloak realm public key from discovery endpoints. Skipping jwt-secret sync."
    return
  fi

  public_key_pem="$(PUBLIC_KEY_RAW="$public_key" python3 - <<'PY'
import os
import textwrap

raw = os.environ.get('PUBLIC_KEY_RAW', '').strip()
print('-----BEGIN PUBLIC KEY-----')
for line in textwrap.wrap(raw, 64):
    print(line)
print('-----END PUBLIC KEY-----')
PY
)"

  log "Applying jwt-secret with current Keycloak realm public key..."
  kubectl -n "$NAMESPACE" create secret generic jwt-secret \
    --from-literal=JWT_PUBLIC_KEY="$public_key_pem" \
    --from-literal=KEYCLOAK_PUBLIC_KEY="$public_key_pem" \
    --from-literal=KEYCLOAK_URL="http://keycloak:8080/auth" \
    --from-literal=KEYCLOAK_REALM="$REALM" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null

  log "Restarting service deployments to pick up refreshed jwt-secret..."
  kubectl -n "$NAMESPACE" get deploy -o name | xargs -r kubectl -n "$NAMESPACE" rollout restart >/dev/null
  kubectl -n "$NAMESPACE" get deploy -o name | xargs -r -I{} kubectl -n "$NAMESPACE" rollout status {} --timeout=240s >/dev/null || true
}

validate_endpoints() {
  local minikube_ip="$1"
  local failures=0

  check_url() {
    local url="$1"
    local label="$2"
    local code
    code="$(curl -ksS -o /dev/null -w '%{http_code}' --resolve "${HOSTNAME_ENTRY}:443:${minikube_ip}" "$url" || true)"
    if [[ "$code" == "200" ]]; then
      log "${label}: OK (200)"
    else
      warn "${label}: unexpected status ${code}"
      failures=$((failures + 1))
    fi
  }

  local oidc_root_code oidc_realm_code
  oidc_root_code="$(curl -ksS -o /dev/null -w '%{http_code}' --resolve "${HOSTNAME_ENTRY}:443:${minikube_ip}" "https://${HOSTNAME_ENTRY}/.well-known/openid-configuration" || true)"
  oidc_realm_code="$(curl -ksS -o /dev/null -w '%{http_code}' --resolve "${HOSTNAME_ENTRY}:443:${minikube_ip}" "https://${HOSTNAME_ENTRY}/auth/realms/${REALM}/.well-known/openid-configuration" || true)"

  if [[ "$oidc_root_code" == "200" || "$oidc_realm_code" == "200" ]]; then
    log "OIDC discovery: OK (root=${oidc_root_code}, realm=${oidc_realm_code})"
  else
    warn "OIDC discovery failed (root=${oidc_root_code}, realm=${oidc_realm_code})"
    failures=$((failures + 1))
  fi

  check_url "https://${HOSTNAME_ENTRY}/api/v1/user-service/health" "User service health"
  check_url "https://${HOSTNAME_ENTRY}/api/v1/feed-service/health" "Feed service health"

  if [[ "$failures" -gt 0 ]]; then
    warn "Validation completed with ${failures} issue(s). See warnings above."
  else
    log "Validation passed. Environment looks healthy."
  fi
}

bootstrap_keycloak_if_needed() {
  local pod admin_user admin_password

  if [[ "$SKIP_KEYCLOAK_BOOTSTRAP" -eq 1 ]]; then
    warn "Skipping Keycloak bootstrap as requested."
    return
  fi

  wait_for_keycloak
  pod="$(kc_pod)"
  [[ -n "$pod" ]] || die "Could not locate Keycloak pod."

  admin_user="$(kubectl -n "$NAMESPACE" get secret keycloak-secret -o jsonpath='{.data.KEYCLOAK_ADMIN}' | base64 -d)"
  admin_password="$(kubectl -n "$NAMESPACE" get secret keycloak-secret -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d)"

  kc_login "$pod" "$admin_user" "$admin_password"
  ensure_realm_roles_clients "$pod"
  ensure_e2e_users "$pod"
}

main() {
  log "Starting post-network-change recovery..."
  ensure_minikube_running

  local minikube_ip
  minikube_ip="$(minikube ip)"
  log "Detected Minikube IP: ${minikube_ip}"

  sync_hosts_entry "$minikube_ip"

  log "Ensuring ingress addon is enabled..."
  minikube addons enable ingress >/dev/null || true

  bootstrap_keycloak_if_needed

  if [[ "$SKIP_JWT_SYNC" -eq 0 ]]; then
    sync_jwt_secret_and_restart "$minikube_ip"
  else
    warn "Skipping jwt-secret sync as requested."
  fi

  validate_endpoints "$minikube_ip"

  log "Recovery workflow finished."
  log "Phone/LAN tip: ${HOSTNAME_ENTRY} must resolve to ${minikube_ip} from the mobile device network as well."
}

main