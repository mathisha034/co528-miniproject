#!/bin/bash
set -e

echo "Getting Master Admin Token..."
TOKEN=$(curl -s -X POST "http://localhost:18080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo "Creating user e2e_admin..."
curl -s -X POST "http://localhost:18080/admin/realms/miniproject/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "username": "e2e_admin",
        "enabled": true,
        "email": "e2e_admin@test.com",
        "firstName": "E2E",
        "lastName": "Admin",
        "credentials": [{
            "type": "password",
            "value": "e2e_password",
            "temporary": false
        }]
      }'

echo "Getting e2e_admin ID..."
USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/users?username=e2e_admin" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n 1)
echo "e2e_admin ID: $USER_ID"

echo "Getting admin role ID..."
ROLE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:18080/admin/realms/miniproject/roles/admin" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "admin role ID: $ROLE_ID"

echo "Assigning admin role to e2e_admin..."
curl -s -X POST "http://localhost:18080/admin/realms/miniproject/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{
        \"id\": \"$ROLE_ID\",
        \"name\": \"admin\"
      }]"

echo "Testing login for e2e_admin via e2e-test-client..."
curl -s -X POST "http://localhost:18080/realms/miniproject/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=e2e_admin" \
  -d "password=e2e_password" \
  -d "grant_type=password" \
  -d "client_id=e2e-test-client" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4 > .e2e_token
  
echo "Token Acquired! Length: $(wc -c < .e2e_token)"
