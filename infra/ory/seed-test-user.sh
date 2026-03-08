#!/usr/bin/env bash
# Seed a test user into Kratos via the Admin API.
# Idempotent: skips creation if testuser@seam.local already exists.
#
# Usage:
#   ./infra/ory/seed-test-user.sh
#   KRATOS_ADMIN_URL=http://localhost:4434 ./infra/ory/seed-test-user.sh

set -euo pipefail

KRATOS_ADMIN="${KRATOS_ADMIN_URL:-http://localhost:4434}"
EMAIL="testuser@seam.local"
PASSWORD="testpass"
NAME="Test User"

echo "Waiting for Kratos admin API at $KRATOS_ADMIN ..."
for i in $(seq 1 30); do
  if curl -sf "$KRATOS_ADMIN/admin/identities" > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Kratos admin API not reachable after 30s" >&2
    exit 1
  fi
  sleep 1
done
echo "Kratos admin API ready."

# Check if user already exists by listing identities and filtering by email.
# Kratos Admin API supports ?credentials_identifier= filter (v1.1+).
EXISTING=$(curl -sf "$KRATOS_ADMIN/admin/identities?credentials_identifier=$EMAIL" 2>/dev/null || echo "[]")
COUNT=$(echo "$EXISTING" | jq 'length')

if [ "$COUNT" -gt 0 ]; then
  IDENTITY_ID=$(echo "$EXISTING" | jq -r '.[0].id')
  echo "Test user already exists (id: $IDENTITY_ID). Skipping creation."
  exit 0
fi

echo "Creating test user ($EMAIL) ..."

RESPONSE=$(curl -sf -X POST "$KRATOS_ADMIN/admin/identities" \
  -H "Content-Type: application/json" \
  -d "$(cat <<PAYLOAD
{
  "schema_id": "default",
  "traits": {
    "email": "$EMAIL",
    "name": "$NAME"
  },
  "credentials": {
    "password": {
      "config": {
        "password": "$PASSWORD"
      }
    }
  },
  "state": "active"
}
PAYLOAD
)")

IDENTITY_ID=$(echo "$RESPONSE" | jq -r '.id')
echo "Created test user: $EMAIL (id: $IDENTITY_ID)"
echo ""
echo "Login credentials:"
echo "  Email:    $EMAIL"
echo "  Password: $PASSWORD"
