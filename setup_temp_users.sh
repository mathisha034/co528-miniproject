#!/bin/bash
set -e

# Delete function (in case we need to clean up old test users first)
cleanup() {
  echo "[Cleanup] Deleting temporary test users..."
  TOKEN=$(curl -s -X POST "http://localhost:18080/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" -d "password=admin" -d "grant_type=password" -d "client_id=admin-cli" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

  for u in temp_student temp_admin; do
    K_UID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/users?username=$u" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n 1 || true)
    if [ ! -z "$K_UID" ]; then
      curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/users/$K_UID"
      echo "- Deleted $u"
    fi
  done

  # Also purge MongoDB documents for these test emails to prevent
  # duplicate-key errors on the next re-run (Keycloak gets a new sub UUID).
  echo "[Cleanup] Purging MongoDB test user documents..."
  kubectl exec -n miniproject statefulset/mongodb -- mongosh miniproject_db --quiet \
    --eval 'db.users.deleteMany({email:{$in:["student@test.com","admin@test.com"]}})' 2>/dev/null \
    && echo "- MongoDB docs purged" || echo "- MongoDB cleanup skipped (pod unavailable)"
}

if [ "$1" == "cleanup" ]; then
  cleanup
  exit 0
fi

cleanup

echo "[Create] Fetching Master Admin Token..."
TOKEN=$(curl -s -X POST "http://localhost:18080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" -d "password=admin" -d "grant_type=password" -d "client_id=admin-cli" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

# CREATE temp_student
echo "[Create] Provisioning temp_student..."
curl -s -X POST "http://localhost:18080/admin/realms/miniproject/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"temp_student","enabled":true,"email":"student@test.com","firstName":"Temp","lastName":"Student","credentials":[{"type":"password","value":"pass","temporary":false}]}'
STUDENT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/users?username=temp_student" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n 1)

# Assign 'student' role
STUDENT_ROLE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/roles/student" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
curl -s -X POST "http://localhost:18080/admin/realms/miniproject/users/$STUDENT_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "[{\"id\":\"$STUDENT_ROLE_ID\",\"name\":\"student\"}]"

# CREATE temp_admin
echo "[Create] Provisioning temp_admin..."
curl -s -X POST "http://localhost:18080/admin/realms/miniproject/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"temp_admin","enabled":true,"email":"admin@test.com","firstName":"Temp","lastName":"Admin","credentials":[{"type":"password","value":"pass","temporary":false}]}'
ADMIN_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/users?username=temp_admin" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n 1)

# Assign 'admin' role
ADMIN_ROLE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/roles/admin" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
curl -s -X POST "http://localhost:18080/admin/realms/miniproject/users/$ADMIN_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "[{\"id\":\"$ADMIN_ROLE_ID\",\"name\":\"admin\"}]"

echo ""
echo "[Fetch] Capturing JWTs via e2e-test-client..."
curl -s -X POST "http://localhost:18080/realms/miniproject/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" -d "username=temp_student" -d "password=pass" -d "grant_type=password" -d "client_id=e2e-test-client" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4 > .e2e_student_token
  
curl -s -X POST "http://localhost:18080/realms/miniproject/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" -d "username=temp_admin" -d "password=pass" -d "grant_type=password" -d "client_id=e2e-test-client" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4 > .e2e_admin_token

echo "[Ready] Tokens written to .e2e_student_token and .e2e_admin_token"
