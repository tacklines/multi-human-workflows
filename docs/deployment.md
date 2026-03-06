# Seam Deployment

Production deployment on AWS EC2 (ARM64 t4g.large) with Docker Compose.

## Architecture

```
Internet → Caddy (TLS) → Docker Compose services
                        ├── seam-server    (Rust API, :3002)
                        ├── seam-worker    (Rust worker)
                        ├── postgres       (pgvector/pg17)
                        ├── rabbitmq       (3-management)
                        ├── zitadel        (OIDC provider, :8080)
                        ├── zitadel-login  (Login V2 Next.js, :3100)
                        └── coder          (workspace manager, :7080)
```

### Caddy Routing

Two virtual hosts:
- `seam.tacklines.com` — frontend (static files from `/opt/seam/static/`) + API proxy (`/api/*`, `/mcp`, `/ws`, `/.well-known/*` → `:3002`)
- `auth.seam.tacklines.com` — Zitadel OIDC (`/ui/v2/login/*` → `:3100` Login V2, everything else → `h2c://:8080` Zitadel API)

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
  -f server/Dockerfile .
```

**Critical**: `VITE_AUTH_AUTHORITY` and `VITE_APP_URL` are baked into the frontend at build time (Vite inlines env vars). Without these, the frontend falls back to `localhost` defaults.

### Build Args

| Arg | Production Value | Default (local dev) |
|---|---|---|
| `VITE_AUTH_AUTHORITY` | `https://auth.seam.tacklines.com` | `http://localhost:8081/realms/seam` |
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

### Zitadel Setup

Zitadel is the OIDC provider (replaced Keycloak). Key settings:

- **External domain**: `auth.seam.tacklines.com`
- **TLS mode**: `external` (Caddy handles TLS)
- **Login V2**: Enabled via separate `zitadel-login` Next.js container
- **Admin**: `admin` user, password in SSM `/seam/zitadel-admin-password`

### Server OIDC

The Rust server reads two env vars for OIDC:

| Env Var | Value | Purpose |
|---|---|---|
| `ISSUER_URL` | `https://auth.seam.tacklines.com` | Token issuer validation, OIDC discovery proxy |
| `JWKS_URL` | `https://auth.seam.tacklines.com/oauth/v2/keys` | JWT signature verification |

**Note**: JWKS_URL uses the external URL (through Caddy) because Zitadel requires the correct `Host` header matching `ZITADEL_EXTERNALDOMAIN`. Internal Docker URLs (e.g., `http://zitadel:8080`) return 404 without the right Host.

### Frontend OIDC

The frontend uses `oidc-client-ts` with authority `https://auth.seam.tacklines.com`. This is baked at build time via `VITE_AUTH_AUTHORITY`. The client ID is `web-app` (must exist in Zitadel as a public PKCE client).

### Required Zitadel Client

A `web-app` application must be configured in Zitadel with:
- Type: User Agent (SPA/public)
- Auth method: PKCE
- Redirect URIs: `https://seam.tacklines.com/auth/callback`
- Post-logout redirect: `https://seam.tacklines.com/`
- Scopes: `openid profile email`

## Secrets

All secrets stored in AWS SSM Parameter Store (SecureString):

| Parameter | Used By |
|---|---|
| `/seam/postgres-password` | Postgres, seam-server, seam-worker, coder |
| `/seam/rabbitmq-password` | RabbitMQ, seam-server, seam-worker |
| `/seam/zitadel-masterkey` | Zitadel encryption |
| `/seam/zitadel-db-password` | Zitadel DB user |
| `/seam/zitadel-admin-password` | Zitadel admin UI |
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
