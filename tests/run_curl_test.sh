#!/bin/bash
set -x

HEADER="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
AUTHOR_PAYLOAD=$(echo -n '{"sub":"111111111111111111111111","email":"author@test.com","name":"Author","realm_access":{"roles":["student"]}}' | base64 -w 0 | tr -d '=' | tr '/+' '_-')
AUTHOR_SIG=$(echo -n "${HEADER}.${AUTHOR_PAYLOAD}" | openssl dgst -sha256 -hmac "dev-secret-change-in-production" -binary | base64 -w 0 | tr -d '=' | tr '/+' '_-')
AUTHOR_TOKEN="${HEADER}.${AUTHOR_PAYLOAD}.${AUTHOR_SIG}"

LIKER_PAYLOAD=$(echo -n '{"sub":"222222222222222222222222","email":"liker@test.com","name":"Liker","realm_access":{"roles":["student","admin"]}}' | base64 -w 0 | tr -d '=' | tr '/+' '_-')
LIKER_SIG=$(echo -n "${HEADER}.${LIKER_PAYLOAD}" | openssl dgst -sha256 -hmac "dev-secret-change-in-production" -binary | base64 -w 0 | tr -d '=' | tr '/+' '_-')
LIKER_TOKEN="${HEADER}.${LIKER_PAYLOAD}.${LIKER_SIG}"

POD_NAME=$(kubectl get pods -n miniproject -l app=user-service --field-selector=status.phase=Running -o jsonpath="{.items[0].metadata.name}")

echo "[CURL] POSTing feed-service..."
POST_RES=$(kubectl exec $POD_NAME -n miniproject -- wget -qO- "http://feed-service:3002/api/v1/feed" \
  --header="Authorization: Bearer $AUTHOR_TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"content": "This is a cURL integration post", "authorId": "111111111111111111111111"}')

echo "POST RESPONSE: $POST_RES"
POST_ID=$(echo $POST_RES | grep -o '"_id":"[^"]*' | cut -d'"' -f4)

echo "[CURL] Found POST_ID: $POST_ID"

echo "[CURL] LIKEing post $POST_ID..."
LIKE_RES=$(kubectl exec $POD_NAME -n miniproject -- wget -qO- "http://feed-service:3002/api/v1/feed/$POST_ID/like" \
  --header="Authorization: Bearer $LIKER_TOKEN" \
  --post-data='')
echo "LIKE RESPONSE: $LIKE_RES"

sleep 3

echo "[CURL] Fetching Notifications..."
NOTIFY_RES=$(kubectl exec $POD_NAME -n miniproject -- wget -qO- "http://notification-service:3006/api/v1/notifications?userId=111111111111111111111111" \
  --header="Authorization: Bearer $AUTHOR_TOKEN")
echo "NOTIFICATIONS: $NOTIFY_RES"

echo "=== FEED LOGS ==="
kubectl logs -n miniproject -l app=feed-service --tail=20
