#!/usr/bin/env bash
# Register OAuth2 clients in Hydra for local dev.
# Idempotent: skips clients that already exist.

set -euo pipefail

HYDRA_ADMIN="${HYDRA_ADMIN_URL:-http://localhost:4445}"
APP_URL="${APP_URL:-http://localhost:8585}"
WORKSPACE_CLIENT_SECRET="${WORKSPACE_CLIENT_SECRET:-workspace-dev-secret}"

echo "Waiting for Hydra admin API at $HYDRA_ADMIN ..."
for i in $(seq 1 30); do
  if curl -sf "$HYDRA_ADMIN/admin/clients" > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Hydra admin API not reachable after 30s" >&2
    exit 1
  fi
  sleep 1
done
echo "Hydra admin API ready."

# --- 1. Web App client (authorization_code + PKCE) ---

WEB_CLIENT_ID="web-app"

if curl -sf "$HYDRA_ADMIN/admin/clients/$WEB_CLIENT_ID" > /dev/null 2>&1; then
  echo "OAuth client '$WEB_CLIENT_ID' already exists. Skipping."
else
  echo "Creating OAuth client '$WEB_CLIENT_ID' ..."
  curl -sf -X POST "$HYDRA_ADMIN/admin/clients" \
    -H "Content-Type: application/json" \
    -d "$(cat <<EOF
{
  "client_id": "$WEB_CLIENT_ID",
  "client_name": "Seam Web App",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid profile email offline_access",
  "redirect_uris": [
    "$APP_URL/auth/callback"
  ],
  "post_logout_redirect_uris": [
    "$APP_URL/"
  ],
  "token_endpoint_auth_method": "none",
  "subject_type": "public"
}
EOF
)" > /dev/null
  echo "Created OAuth client '$WEB_CLIENT_ID' (redirect: $APP_URL/auth/callback)"
fi

# --- 2. Workspace client (client_credentials for Coder workspaces) ---
# Used by the Seam server to mint JWTs for workspace-to-server auth.
# The server reads WORKSPACE_CLIENT_SECRET from env to call the token endpoint.

WS_CLIENT_ID="seam-workspace"

if curl -sf "$HYDRA_ADMIN/admin/clients/$WS_CLIENT_ID" > /dev/null 2>&1; then
  echo "OAuth client '$WS_CLIENT_ID' already exists. Skipping."
else
  echo "Creating OAuth client '$WS_CLIENT_ID' ..."
  curl -sf -X POST "$HYDRA_ADMIN/admin/clients" \
    -H "Content-Type: application/json" \
    -d "$(cat <<EOF
{
  "client_id": "$WS_CLIENT_ID",
  "client_name": "Seam Workspace Agent",
  "client_secret": "$WORKSPACE_CLIENT_SECRET",
  "grant_types": ["client_credentials"],
  "response_types": [],
  "scope": "openid",
  "token_endpoint_auth_method": "client_secret_basic"
}
EOF
)" > /dev/null
  echo "Created OAuth client '$WS_CLIENT_ID' (client_credentials)"
fi
