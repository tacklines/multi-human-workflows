# Seam

set dotenv-load

export POSTGRES_PORT := env("POSTGRES_PORT", "5433")
export DATABASE_URL := env("DATABASE_URL", "postgres://seam:seam@localhost:" + POSTGRES_PORT + "/seam")
export HYDRA_PUBLIC_PORT := env("HYDRA_PUBLIC_PORT", "4444")
export KRATOS_PUBLIC_PORT := env("KRATOS_PUBLIC_PORT", "4433")

# Start everything: infra + backend + frontend
dev: infra-up
    #!/usr/bin/env bash
    set -e
    trap 'kill 0' EXIT

    echo "⏳ Waiting for Postgres..."
    until pg_isready -h localhost -p {{POSTGRES_PORT}} -U seam -q 2>/dev/null; do sleep 0.5; done
    echo "✓ Postgres ready"

    echo "⏳ Waiting for Hydra..."
    until curl -sf http://localhost:{{HYDRA_PUBLIC_PORT}}/health/ready > /dev/null 2>&1; do sleep 1; done
    echo "✓ Hydra ready"

    echo "⏳ Waiting for Kratos..."
    until curl -sf http://localhost:{{KRATOS_PUBLIC_PORT}}/health/ready > /dev/null 2>&1; do sleep 1; done
    echo "✓ Kratos ready"

    # Source Coder credentials if coder-init has written them
    if [ -f .env.coder ]; then
      echo "✓ Loading Coder credentials from .env.coder"
      set -a; source .env.coder; set +a
    fi

    ./infra/ory/seed-hydra-client.sh &
    ./infra/ory/seed-test-user.sh &

    echo "🚀 Starting backend + frontend..."
    cd server && cargo watch -x 'run --bin seam-server' 2>&1 | sed 's/^/[server] /' &
    sleep 2
    cd frontend && npx vite 2>&1 | sed 's/^/[frontend] /' &
    wait

# Start only backend + frontend (assumes infra already running)
dev-no-infra:
    #!/usr/bin/env bash
    set -e
    trap 'kill 0' EXIT
    cd server && cargo watch -x 'run --bin seam-server' 2>&1 | sed 's/^/[server] /' &
    sleep 2
    cd frontend && npx vite 2>&1 | sed 's/^/[frontend] /' &
    wait

# Start everything with MCP auth disabled (for local MCP clients without OAuth)
dev-noauth: infra-up
    #!/usr/bin/env bash
    set -e
    trap 'kill 0' EXIT

    echo "⏳ Waiting for Postgres..."
    until pg_isready -h localhost -p {{POSTGRES_PORT}} -U seam -q 2>/dev/null; do sleep 0.5; done
    echo "✓ Postgres ready"

    echo "⏳ Waiting for Hydra..."
    until curl -sf http://localhost:{{HYDRA_PUBLIC_PORT}}/health/ready > /dev/null 2>&1; do sleep 1; done
    echo "✓ Hydra ready"

    echo "⏳ Waiting for Kratos..."
    until curl -sf http://localhost:{{KRATOS_PUBLIC_PORT}}/health/ready > /dev/null 2>&1; do sleep 1; done
    echo "✓ Kratos ready"

    # Source Coder credentials if coder-init has written them
    if [ -f .env.coder ]; then
      echo "✓ Loading Coder credentials from .env.coder"
      set -a; source .env.coder; set +a
    fi

    ./infra/ory/seed-hydra-client.sh &
    ./infra/ory/seed-test-user.sh &

    echo "🚀 Starting backend (MCP auth disabled) + frontend..."
    export MCP_AUTH_DISABLED=true
    cd server && cargo watch -x 'run --bin seam-server' 2>&1 | sed 's/^/[server] /' &
    sleep 2
    cd frontend && npx vite 2>&1 | sed 's/^/[frontend] /' &
    wait

# Backend only (hot reload)
server:
    cd server && cargo watch -x 'run --bin seam-server'

# Backend with MCP auth disabled (for local MCP clients without OAuth)
server-noauth:
    export MCP_AUTH_DISABLED=true && cd server && cargo watch -x 'run --bin seam-server'

# Frontend only
frontend:
    cd frontend && npx vite

# Start Docker infra (Hydra + Kratos + Postgres + RabbitMQ)
infra-up:
    docker compose up -d

# Start Docker infra with Coder (auto-bootstraps first user + template + token)
coder-up:
    docker compose --profile coder up -d
    @echo "Waiting for coder-init to finish..."
    @docker compose --profile coder logs -f coder-init 2>/dev/null || true
    @if [ -f .env.coder ]; then echo "✓ Coder ready — .env.coder written"; else echo "⚠ .env.coder not found — check coder-init logs"; fi

# Stop Docker infra
infra-down:
    docker compose down

# Stop Docker infra and wipe volumes
infra-reset:
    docker compose down -v

# Run Rust backend checks
check:
    cd server && cargo check

# Type-check frontend
check-frontend:
    cd frontend && npx tsc --noEmit

# Check everything (compile + type-check + lint)
check-all: check check-frontend lint

# Build frontend for production
build-frontend:
    cd frontend && npx vite build

# Build backend release
build-server:
    cd server && cargo build --release

# Build everything
build: build-server build-frontend

# Install frontend deps
install:
    cd frontend && npm install

# Run backend tests
test:
    cd server && cargo test

# Run frontend tests
test-frontend:
    cd frontend && npm test

# Run all tests
test-all: test test-frontend

# Lint everything (clippy + oxlint + fmt check)
lint:
    cd server && cargo clippy --all-targets -- -D warnings
    cd server && cargo fmt -- --check
    cd frontend && npx oxlint src/

# Security audit (CVEs + licenses + secrets)
audit:
    cd server && cargo audit --ignore RUSTSEC-2023-0071 --ignore RUSTSEC-2024-0384 --ignore RUSTSEC-2025-0134 --ignore RUSTSEC-2026-0002
    cd server && cargo deny check advisories bans sources
    gitleaks detect --no-banner

# Format code
fmt:
    cd server && cargo fmt
    cd frontend && npx oxlint src/ --fix || true

# Show Docker container status
ps:
    docker compose ps

# Tail Docker logs
logs service="":
    docker compose logs -f {{service}}

# Get a test token from Hydra (creates a client_credentials client, then fetches a JWT)
token:
    #!/usr/bin/env bash
    set -euo pipefail
    HYDRA_ADMIN="http://localhost:${HYDRA_ADMIN_PORT:-4445}"
    # Create (or reuse) a test client
    CLIENT=$(curl -sf "$HYDRA_ADMIN/admin/clients" \
      -H "Content-Type: application/json" \
      -d '{"client_id":"seam-test","client_secret":"seam-test-secret","grant_types":["client_credentials"],"token_endpoint_auth_method":"client_secret_post","scope":"openid"}' 2>/dev/null \
      || curl -sf "$HYDRA_ADMIN/admin/clients/seam-test" 2>/dev/null)
    # Fetch token
    curl -s -X POST http://localhost:{{HYDRA_PUBLIC_PORT}}/oauth2/token \
      -d "grant_type=client_credentials" \
      -d "client_id=seam-test" \
      -d "client_secret=seam-test-secret" \
      -d "scope=openid" | jq -r '.access_token'

# Run the background worker (scheduler + reactions)
worker:
    cd server && cargo run --bin seam-worker

# Seed test user into Kratos (idempotent)
seed-user:
    ./infra/ory/seed-test-user.sh

# Create a test session (requires running backend)
test-session:
    #!/usr/bin/env bash
    TOKEN=$(just token)
    curl -s -X POST http://localhost:3002/api/sessions \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}' | jq .

