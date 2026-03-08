#!/bin/bash
# Sync the seam-agent Coder template if it has changed since last push.
# Compares a content hash of the template directory against a stored hash.
#
# Usage:
#   ./infra/coder/template-sync.sh          # push only if changed
#   ./infra/coder/template-sync.sh --force   # push unconditionally
#
# Requires CODER_URL and CODER_TOKEN (typically from .env.coder).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/infra/coder/templates/seam-agent"
HASH_FILE="$REPO_ROOT/.coder-template-hash"
FORCE="${1:-}"

# --- preflight checks ---

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "ERROR: Template directory not found: $TEMPLATE_DIR"
  exit 1
fi

if [ -z "${CODER_URL:-}" ] || [ -z "${CODER_TOKEN:-}" ]; then
  echo "⏭  Skipping template sync — CODER_URL/CODER_TOKEN not set"
  exit 0
fi

if ! command -v coder &> /dev/null; then
  echo "⏭  Skipping template sync — coder CLI not found"
  exit 0
fi

# --- compute current hash ---

# Hash all file contents in the template directory, sorted for determinism.
CURRENT_HASH=$(find "$TEMPLATE_DIR" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)

# --- compare against stored hash ---

if [ "$FORCE" != "--force" ] && [ -f "$HASH_FILE" ]; then
  STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")
  if [ "$CURRENT_HASH" = "$STORED_HASH" ]; then
    echo "✓ Coder template up to date (hash unchanged)"
    exit 0
  fi
  echo "Template changed (stored: ${STORED_HASH:0:12}… current: ${CURRENT_HASH:0:12}…)"
fi

# --- verify Coder is reachable ---

if ! curl -sf "${CODER_URL}/api/v2/buildinfo" > /dev/null 2>&1; then
  echo "⏭  Skipping template sync — Coder not reachable at $CODER_URL"
  exit 0
fi

# --- check template exists (must have been bootstrapped first) ---

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Coder-Session-Token: $CODER_TOKEN" \
  "${CODER_URL}/api/v2/organizations/default/templates/seam-agent" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "⏭  Template 'seam-agent' not found — run 'just coder-up' to bootstrap first"
  exit 0
fi

# --- push template ---

echo "Pushing seam-agent template..."
coder templates push seam-agent \
  --directory "$TEMPLATE_DIR" \
  --yes 2>&1

echo "$CURRENT_HASH" > "$HASH_FILE"
echo "✓ Template pushed and hash recorded"
