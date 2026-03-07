#!/bin/bash

BASE_URL="http://127.0.0.1:8080"
HEADER="Host: api.miniproject.local"
USER_ID="user-$(date +%s)"
POST_ID=""

echo "=== 1. Creating User ==="
curl -v -X POST "${BASE_URL}/api/v1/user-service/users" \
  -H "${HEADER}" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"testuser-${USER_ID}\", \"email\": \"${USER_ID}@test.com\"}"

echo -e "\n=== 2. Creating Post (Feed Service) ==="
POST_RES=$(curl -X POST "${BASE_URL}/api/v1/feed-service/posts" \
  -H "${HEADER}" \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d "{\"content\": \"This is my first integration post\", \"authorId\": \"${USER_ID}\"}")
echo "Post Response: $POST_RES"
POST_ID=$(echo $POST_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4 || echo "60d5ecb4b3b3a3001f3e1234")

if [ -z "$POST_ID" ]; then
    POST_ID="dummy-post-id"
fi

echo -e "\n=== 3. Liking Post (Event Service) ==="
curl -v -X POST "${BASE_URL}/api/v1/event-service/events" \
  -H "${HEADER}" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"LIKE\", \"userId\": \"liker-user\", \"resourceId\": \"${POST_ID}\", \"metadata\": {}}"

sleep 2 

echo -e "\n=== 4. Getting Notifications (Notification Service) ==="
curl -v -X GET "${BASE_URL}/api/v1/notification-service/notifications?userId=${USER_ID}" \
  -H "${HEADER}"

echo -e "\n=== End of Journey ==="
