#!/bin/bash

# Configuration script for Keycloak using kcadm.sh
# Ensure Keycloak is fully running before executing this script.

CONFIG_CMD="docker exec -i keycloak /opt/keycloak/bin/kcadm.sh"

echo "Logging into Keycloak admin CLI..."
$CONFIG_CMD config credentials --server http://localhost:8080 --realm master --user admin --password admin

echo "Creating 'miniproject' realm..."
$CONFIG_CMD create realms -s realm=miniproject -s enabled=true || echo "Realm might already exist."

echo "Creating roles: student, alumni, admin..."
$CONFIG_CMD create roles -r miniproject -s name=student || true
$CONFIG_CMD create roles -r miniproject -s name=alumni || true
$CONFIG_CMD create roles -r miniproject -s name=admin || true

echo "Creating clients (web and mobile)..."
# Web client
$CONFIG_CMD create clients -r miniproject -s clientId=web-client -s enabled=true -s publicClient=true -s 'redirectUris=["http://localhost:3000/*","http://localhost:80/*"]' -s 'webOrigins=["+"]' || true

# Mobile client
$CONFIG_CMD create clients -r miniproject -s clientId=mobile-client -s enabled=true -s publicClient=true -s 'redirectUris=["*"]' || true

echo "Keycloak setup complete! You can log in at http://localhost:8081"
