# Seam Deployment

Production deployment on AWS EC2 (ARM64 t4g.large) with Docker Compose.

## Architecture

```
Internet → Caddy (TLS) → Docker Compose services
                        ├── seam-server    (Rust API, :3002)
                        ├── seam-worker    (Rust worker)
                        ├── postgres       (pgvector/pg17)
                        ├── rabbitmq       (3-management)
                        ├── hydra          (OAuth2/OIDC provider, :4444/:4445)
                        ├── kratos         (Identity management, :4433)
                        └── coder          (workspace manager, :7080)
```

### Caddy Routing

Two virtual hosts:
- `seam.tacklines.com` — frontend (static files from `/opt/seam/static/`) + API proxy (`/api/*`, `/mcp`, `/ws`, `/.well-known/*`, `/auth/*` → `:3002`)
- `auth.seam.tacklines.com` — Ory Hydra OAuth2 (`:4444` public, `:4445` admin) + Kratos identity (`:4433`)

### Frontend Serving

Caddy serves static files directly (not through the Rust server). On deploy, static assets are extracted from the Docker image:

```bash
docker create --name seam-extract $IMAGE true
docker cp seam-extract:/app/static/. /opt/seam/static/
docker rm seam-extract
chown -R caddy:caddy /opt/seam/static
```

## Building

The Docker image (multi-stage: Node frontend → Rust builder → Debian runtime) must be built on ARM64. The EC2 instance itself is used as the build host since local dev machines are typically x86_64.

### Build Command

```bash
docker build \
  --build-arg VITE_AUTH_AUTHORITY=https://auth.seam.tacklines.com \
  --build-arg VITE_APP_URL=https://seam.tacklines.com \
  --build-arg VITE_CLIENT_ID=362967076937138180 \
  -f server/Dockerfile .
```

**Critical**: `VITE_AUTH_AUTHORITY`, `VITE_APP_URL`, and `VITE_CLIENT_ID` are baked into the frontend at build time (Vite inlines env vars). Without these, the frontend falls back to `localhost` defaults.

### Build Args

| Arg | Production Value | Default (local dev) |
|---|---|---|
| `VITE_AUTH_AUTHORITY` | `https://auth.seam.tacklines.com` | `http://localhost:4444` |
| `VITE_APP_URL` | `https://seam.tacklines.com` | `http://localhost:5173` |
| `VITE_CLIENT_ID` | `362967076937138180` | `web-app` |

### ECR Push

The EC2 role (`seam-ec2`) only has ECR **pull** permissions. Push requires the `github_actions_ecr` role or must be done from a machine with push credentials.

Current workaround: build on EC2, tag as the ECR image name, deploy directly without pushing.

```bash
# On EC2:
docker tag seam-server:latest $SEAM_IMAGE
docker-compose -f docker-compose.prod.yml up -d seam-server seam-worker
```

## Deploy Steps

### Full Redeploy (code changes)

```bash
# 1. SSH to instance
ssh ec2-user@35.174.204.185

# 2. Pull latest code
cd /opt/seam/repo && sudo git pull

# 3. Build image (takes ~10min for Rust compilation)
sudo docker build \
  --build-arg VITE_AUTH_AUTHORITY=https://auth.seam.tacklines.com \
  --build-arg VITE_APP_URL=https://seam.tacklines.com \
  --build-arg VITE_CLIENT_ID=362967076937138180 \
  -f server/Dockerfile -t seam-server:latest .

# 4. Tag for compose
source /opt/seam/.env
sudo docker tag seam-server:latest $SEAM_IMAGE

# 5. Extract frontend static files
sudo docker rm -f seam-extract 2>/dev/null
sudo docker create --name seam-extract seam-server:latest true
sudo docker cp seam-extract:/app/static/. /opt/seam/static/
sudo docker rm seam-extract
sudo chown -R caddy:caddy /opt/seam/static

# 6. Restart services
sudo /usr/local/bin/docker-compose -f docker-compose.prod.yml up -d seam-server seam-worker
```

### Config-Only Change (docker-compose.prod.yml)

```bash
cd /opt/seam/repo && sudo git pull
sudo /usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
```

### Restart Without Rebuild

```bash
sudo /usr/local/bin/docker-compose -f docker-compose.prod.yml restart seam-server seam-worker
```

## OIDC Configuration

### Ory Hydra + Kratos Setup

Ory Hydra is the OAuth2/OIDC provider. Ory Kratos handles identity management (registration, login, account recovery). Key settings:

- **Hydra public**: `:4444` (token endpoint, authorization endpoint)
- **Hydra admin**: `:4445` (client management, consent/login flow management)
- **Kratos public**: `:4433` (self-service flows: login, registration, recovery)
- **Auth UI**: Seam server serves auth UI pages at `/auth/*` (login, registration, consent)

### Server OIDC

The Rust server reads env vars for OIDC:

| Env Var | Value | Purpose |
|---|---|---|
| `ISSUER_URL` | `https://auth.seam.tacklines.com` | Token issuer validation, OIDC discovery |
| `JWKS_URL` | `https://auth.seam.tacklines.com/oauth/v2/keys` | JWT signature verification |
| `HYDRA_ADMIN_URL` | `http://hydra:4445` | Hydra admin API for login/consent flow |
| `KRATOS_PUBLIC_URL` | `http://kratos:4433` | Kratos public API for identity lookups |

### Frontend OIDC

The frontend uses `oidc-client-ts` with authority pointing to Hydra's public endpoint. This is baked at build time via `VITE_AUTH_AUTHORITY`.

### Required Hydra Client

An OAuth2 client must be registered in Hydra:
- **Client ID**: configured via `VITE_CLIENT_ID` build arg
- **Grant types**: `authorization_code`, `refresh_token`
- **Response types**: `code`
- **Auth method**: `none` (public/SPA client, uses PKCE)
- **Redirect URIs**: `https://seam.tacklines.com/auth/callback`
- **Post-logout redirect**: `https://seam.tacklines.com/`
- **Scopes**: `openid profile email offline_access`
- **Dev redirect URIs** (optional): `http://localhost:5173/auth/callback`, `http://localhost:5173/`

## Secrets

All secrets stored in AWS SSM Parameter Store (SecureString):

| Parameter | Used By |
|---|---|
| `/seam/postgres-password` | Postgres, seam-server, seam-worker, hydra, kratos, coder |
| `/seam/rabbitmq-password` | RabbitMQ, seam-server, seam-worker |
| `/seam/hydra-system-secret` | Hydra encryption |
| `/seam/kratos-secret` | Kratos cookie/session secret |
| `/seam/credential-master-key` | Fernet key for credential encryption |
| `/seam/worker-api-token` | Worker → server API auth |

Secrets are fetched by `user-data.sh` at instance launch and written to `/opt/seam/.env`.

## Infrastructure

### Instance

- **Type**: t4g.large (ARM64, 2 vCPU, 8 GB RAM)
- **IP**: 35.174.204.185 (Elastic IP)
- **SSH**: `ssh ec2-user@35.174.204.185`
- **SSM**: Available via `aws ssm start-session`
- **Tailscale**: Enrolled as `seam-prod`

### DNS

- `seam.tacklines.com` → Elastic IP (Caddy auto-TLS)
- `auth.seam.tacklines.com` → Elastic IP (Caddy auto-TLS)

### Backups

- **Postgres**: Daily `pg_dump` to `s3://seam-backups/postgres/` (systemd timer, 03:00 UTC)
- **Caddy certs**: Daily to `s3://seam-backups/caddy/` (systemd timer, 04:00 UTC)
- **Caddy cert restore**: Runs on instance boot from S3

### Docker Compose

Uses standalone `docker-compose` binary (v2.27.0) at `/usr/local/bin/docker-compose`, NOT the Docker plugin (`docker compose`). The instance's Docker version (25.x) doesn't include the compose plugin.

## Known Issues

- **No health check endpoint**: The Dockerfile defines `HEALTHCHECK` on `/api/health` but the route doesn't exist. Containers show as "unhealthy" but function normally.
- **No CI/CD pipeline**: Builds and deploys are manual. A GitHub Actions workflow for ECR push would automate this.
- **EC2 ECR push**: The EC2 IAM role only has pull permissions. Images built on-instance must be tagged locally rather than pushed/pulled from ECR.
- **`resource` URL in RFC 9728**: The `oauth-protected-resource` endpoint returns `http://seam-server:3002/mcp` (internal Docker URL) because `SEAM_URL` is set for internal API calls. Should be the public URL for external MCP clients.

## Gotchas

### Docker Build Cache and Frontend Changes

Docker's build cache can silently serve stale frontend bundles. The `COPY frontend/ ./` layer is keyed on file content hashes, but Docker's cache can sometimes reuse old layers incorrectly (especially with BuildKit). **If frontend changes aren't reflected after deploy:**

```bash
# Force full rebuild (slow — rebuilds Rust too)
sudo docker build --no-cache ...

# Or invalidate just the frontend by touching a file
touch frontend/cache-bust && sudo docker build ...
```

After extracting static files, verify the new bundle is in place:
```bash
# Check that index.html timestamp matches the build
ls -la /opt/seam/static/index.html
# Verify expected content is baked in
grep '362967076937138180' /opt/seam/static/assets/*.js
```

After deploying, containers may show "Running" instead of "Recreated" if the image digest didn't change in compose's view. Force recreate:
```bash
sudo /usr/local/bin/docker-compose -f docker-compose.prod.yml up -d --force-recreate seam-server seam-worker
```

### Hydra Access Tokens and User Claims

Hydra JWT access tokens contain standard OAuth2 claims (`sub`, `iss`, `aud`, `scope`). User profile information (name, email) is fetched from Kratos identity data during the consent flow and included as custom claims, or retrieved via the userinfo endpoint.

The server calls the **userinfo endpoint** to fetch profile claims when needed, cached per-user for 5 minutes. The frontend also calls `GET /api/me` after login to get the enriched display name.
