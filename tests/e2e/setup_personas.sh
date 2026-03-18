#!/bin/bash
# ============================================================
#  DECP — E2E Persona Setup
#  Creates 3 test users in Keycloak, assigns realm roles,
#  fetches JWTs and saves them + Keycloak sub UUIDs for tests.
#
#  Output files (in project root):
#    .e2e_student_token   – Ashan's JWT
#    .e2e_alumni_token    – Nimali's JWT
#    .e2e_admin_token     – Dr. Rajapaksha's JWT
#    .e2e_student_id      – Ashan's Keycloak sub UUID
#    .e2e_alumni_id       – Nimali's Keycloak sub UUID
#    .e2e_admin_id        – Dr. Rajapaksha's Keycloak sub UUID
# ============================================================
set -e

KEYCLOAK_BASE="http://localhost:18080"
REALM="miniproject"
CLIENT="e2e-test-client"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Keycloak in this project is commonly exposed with --http-relative-path=/auth.
# Auto-detect and use the right base path to keep this script portable.
if curl -sf "$KEYCLOAK_BASE/auth/realms/master/.well-known/openid-configuration" >/dev/null; then
  KEYCLOAK="$KEYCLOAK_BASE/auth"
else
  KEYCLOAK="$KEYCLOAK_BASE"
fi

echo "================================================================"
echo " DECP E2E — Persona Setup"
echo "================================================================"

# ── Master token ──────────────────────────────────────────────────────────────
echo "[1/5] Fetching Keycloak master admin token..."
MASTER_TOKEN=$(curl -sf -X POST \
  "$KEYCLOAK/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
if [ -z "$MASTER_TOKEN" ]; then echo "[ERROR] Cannot get master token"; exit 1; fi

# ── Extend access token lifetime to 1 hour (prevents expiry during test run) ─
curl -sf -X PUT "$KEYCLOAK/admin/realms/$REALM" \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accessTokenLifespan": 3600}' \
  && echo "  - Access token lifetime set to 3600s (1 hour)"

# ── Cleanup existing test users ───────────────────────────────────────────────
echo "[2/5] Cleaning up old test users..."
for username in e2e_student e2e_alumni e2e_admin; do
  K_UID=$(curl -s -H "Authorization: Bearer $MASTER_TOKEN" \
    "$KEYCLOAK/admin/realms/$REALM/users?username=$username" \
    | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n1 || true)
  if [ -n "$K_UID" ]; then
    curl -sf -X DELETE -H "Authorization: Bearer $MASTER_TOKEN" \
      "$KEYCLOAK/admin/realms/$REALM/users/$K_UID" && echo "  - Deleted $username"
  fi
done

# Purge MongoDB documents for these test emails
echo "[2/5] Purging MongoDB test documents..."
kubectl exec -n miniproject statefulset/mongodb -- mongosh miniproject_db --quiet \
  --eval 'db.users.deleteMany({email:{$in:["ashan@e2e.test","nimali@e2e.test","dr.raj@e2e.test"]}})' \
  2>/dev/null && echo "  - MongoDB docs purged" || echo "  - MongoDB cleanup skipped"

# ── Create users ──────────────────────────────────────────────────────────────
echo "[3/5] Provisioning personas..."

create_user() {
  local USERNAME=$1 EMAIL=$2 FIRSTNAME=$3 LASTNAME=$4 ROLE=$5
  curl -sf -X POST "$KEYCLOAK/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $MASTER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"enabled\":true,\"email\":\"$EMAIL\",\"firstName\":\"$FIRSTNAME\",\"lastName\":\"$LASTNAME\",\"credentials\":[{\"type\":\"password\",\"value\":\"pass123\",\"temporary\":false}]}" \
    > /dev/null
  local KC_UID
  KC_UID=$(curl -s -H "Authorization: Bearer $MASTER_TOKEN" \
    "$KEYCLOAK/admin/realms/$REALM/users?username=$USERNAME" \
    | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n1)
  local ROLE_ID
  ROLE_ID=$(curl -s -H "Authorization: Bearer $MASTER_TOKEN" \
    "$KEYCLOAK/admin/realms/$REALM/roles/$ROLE" \
    | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  curl -sf -X POST "$KEYCLOAK/admin/realms/$REALM/users/$KC_UID/role-mappings/realm" \
    -H "Authorization: Bearer $MASTER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[{\"id\":\"$ROLE_ID\",\"name\":\"$ROLE\"}]" > /dev/null
  echo "  + Created $USERNAME ($ROLE)"
}

create_user "e2e_student" "ashan@e2e.test" "Ashan" "Kumar"  "student"
create_user "e2e_alumni"  "nimali@e2e.test" "Nimali" "Perera" "alumni"
create_user "e2e_admin"   "dr.raj@e2e.test"  "Dr" "Rajapaksha" "admin"

# ── Fetch JWTs ────────────────────────────────────────────────────────────────
echo "[4/5] Fetching JWTs..."

fetch_token() {
  local USERNAME=$1 OUTFILE=$2 IDFILE=$3
  local TOKEN
  TOKEN=$(curl -sf -X POST "$KEYCLOAK/realms/$REALM/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$USERNAME&password=pass123&grant_type=password&client_id=$CLIENT" \
    | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
  if [ -z "$TOKEN" ]; then echo "[ERROR] Could not fetch token for $USERNAME"; exit 1; fi
  echo "$TOKEN" > "$ROOT/$OUTFILE"
  # Decode sub UUID from JWT (base64url decode payload)
  local PAYLOAD="${TOKEN#*.}"
  PAYLOAD="${PAYLOAD%.*}"
  # Pad base64 if needed
  local MOD=$((${#PAYLOAD} % 4))
  if [ $MOD -eq 2 ]; then PAYLOAD="${PAYLOAD}=="; elif [ $MOD -eq 3 ]; then PAYLOAD="${PAYLOAD}="; fi
  echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['sub'])" > "$ROOT/$IDFILE" 2>/dev/null \
    || echo "unknown" > "$ROOT/$IDFILE"
  echo "  - $USERNAME → $OUTFILE  (sub=$(cat $ROOT/$IDFILE | head -c 8)...)"
}

fetch_token "e2e_student" ".e2e_student_token"  ".e2e_student_id"
fetch_token "e2e_alumni"  ".e2e_alumni_token"   ".e2e_alumni_id"
fetch_token "e2e_admin"   ".e2e_admin_token"    ".e2e_admin_id"

echo "[5/5] ✅ All personas ready."
echo "  Student:  .e2e_student_token  (sub=$(cat $ROOT/.e2e_student_id))"
echo "  Alumni:   .e2e_alumni_token   (sub=$(cat $ROOT/.e2e_alumni_id))"
echo "  Admin:    .e2e_admin_token    (sub=$(cat $ROOT/.e2e_admin_id))"
