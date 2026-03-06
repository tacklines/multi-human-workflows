# Deployment Plan: Seam Platform

**Status**: Draft
**Date**: 2026-03-06
**Last Updated**: 2026-03-06

## Overview

Deploy Seam to a 2-node k3s cluster on the home network (.12 and .13), with security as a cross-cutting concern from Phase 1 onward. Agent workspaces execute untrusted code — every phase accounts for isolation, resource control, and blast radius containment.

See [ADR-001](adrs/ADR-001-k3s.md) for the k3s decision, [ADR-002](adrs/ADR-002-self-hosted.md) for self-hosted rationale.

## Infrastructure

### Hardware

| Host | IP | RAM | vCPUs | Role |
|------|----|-----|-------|------|
| docker001 | .12 | 64GB | 12 | k3s server (control plane + platform workloads) |
| docker002 | .13 | 96GB | 18 | k3s agent (Coder + workspace pods) |
| media-server | .14 | 125GB | 12 | Nginx reverse proxy (TLS termination) |
| nfs001 | .34 | 8GB | 4 | Backup target |

### Cluster Layout

```
k3s cluster (Cilium CNI)
|
+-- namespace: seam-core (.12 preferred)
|   +-- StatefulSet: postgres
|   +-- Deployment: zitadel (OIDC)
|   +-- Deployment: seam-server
|   +-- Deployment: seam-worker
|   +-- Deployment: rabbitmq
|   +-- CronJob: postgres-backup
|
+-- namespace: seam-coder (.13 preferred)
|   +-- Deployment: coder
|   +-- ResourceQuota: workspace limits
|   +-- NetworkPolicy: default-deny-all
|   +-- CiliumNetworkPolicy: egress allowlist
|   +-- (Coder-spawned workspace pods)
```

### Network Topology

```
Internet -> pfSense :443 -> .14 Nginx (TLS) -> k3s Traefik (NodePort) -> Services
```

See [ADR-004](adrs/ADR-004-tls-termination.md) for TLS termination decision.

---

## Phase 1: Cluster Bootstrap

**Goal**: Standing 2-node k3s cluster with Cilium CNI and namespace isolation.

### Steps

1. **Install k3s server on .12** with Cilium CNI (disabling default Flannel):
   ```bash
   curl -sfL https://get.k3s.io | sh -s - server \
     --tls-san 192.168.1.12 \
     --node-label role=platform \
     --flannel-backend=none \
     --disable-network-policy
   ```

2. **Install Cilium** (provides CNI + FQDN-based network policies):
   ```bash
   cilium install --set kubeProxyReplacement=true
   cilium status --wait
   ```

3. **Join .13 as agent node**:
   ```bash
   curl -sfL https://get.k3s.io | K3S_URL=https://192.168.1.12:6443 \
     K3S_TOKEN=<token> sh -s - agent \
     --node-label role=worker
   ```

4. **Create namespaces with baseline security**:
   ```bash
   kubectl create namespace seam-core
   kubectl create namespace seam-coder
   ```

5. **Apply default-deny NetworkPolicy to seam-coder** (see [ADR-006](adrs/ADR-006-workspace-security.md)):
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: default-deny-all
     namespace: seam-coder
   spec:
     podSelector: {}
     policyTypes: [Ingress, Egress]
   ```

6. **Apply workspace egress allowlist** (CiliumNetworkPolicy for FQDN-based rules):
   ```yaml
   apiVersion: cilium.io/v2
   kind: CiliumNetworkPolicy
   metadata:
     name: workspace-egress-allowlist
     namespace: seam-coder
   spec:
     endpointSelector:
       matchLabels:
         app.kubernetes.io/managed-by: coder
     egress:
       - toEndpoints:
           - matchLabels:
               io.kubernetes.pod.namespace: kube-system
               k8s-app: kube-dns
         toPorts:
           - ports: [{port: "53", protocol: UDP}]
       - toEndpoints:
           - matchLabels:
               io.kubernetes.pod.namespace: seam-core
               app: seam-server
         toPorts:
           - ports: [{port: "3002", protocol: TCP}]
       - toFQDNs:
           - matchName: api.anthropic.com
           - matchName: api.openai.com
           - matchName: github.com
           - matchName: registry.npmjs.org
           - matchName: crates.io
           - matchName: static.crates.io
           - matchName: pypi.org
           - matchName: files.pythonhosted.org
         toPorts:
           - ports: [{port: "443", protocol: TCP}]
   ```

7. **Apply ResourceQuota to seam-coder**:
   ```yaml
   apiVersion: v1
   kind: ResourceQuota
   metadata:
     name: workspace-quota
     namespace: seam-coder
   spec:
     hard:
       requests.cpu: "12"
       requests.memory: 48Gi
       limits.cpu: "16"
       limits.memory: 64Gi
       pods: "8"
   ```

### Validation

- `kubectl get nodes` shows both nodes `Ready`
- `cilium status` shows all components healthy
- `cilium connectivity test` passes
- NetworkPolicy blocks cross-namespace traffic from seam-coder to seam-core (test with a temporary pod)

### Artifacts to Create

- `infra/k8s/namespaces.yaml`
- `infra/k8s/seam-coder/network-policies.yaml`
- `infra/k8s/seam-coder/resource-quota.yaml`

---

## Phase 2: Platform Services

**Goal**: Postgres, Zitadel (OIDC), and Seam server running in `seam-core`.

See [ADR-003](adrs/ADR-003-oidc-provider.md) for OIDC provider choice, [ADR-005](adrs/ADR-005-secrets-management.md) for secrets approach.

### Prerequisites

- Phase 1 complete
- SOPS + age configured (age key generated, `.gitignore`d)
- Seam server Dockerfile created (multi-stage Rust build)
- Container images pushed to registry (192.168.1.45:5000 or GHCR)

### Steps

1. **Create encrypted secrets** (SOPS + age):
   ```bash
   # Generate age key (once, back up securely)
   age-keygen -o infra/k8s/age.key

   # Encrypt secrets manifest
   sops --encrypt --age <public-key> infra/k8s/seam-core/secrets.yaml \
     > infra/k8s/seam-core/secrets.enc.yaml
   ```

   Secrets to include:
   - `CREDENTIAL_MASTER_KEY` — mounted as volume, not env var
   - Postgres credentials (seam DB + zitadel DB)
   - Zitadel admin credentials

2. **Deploy Postgres StatefulSet**:
   - Image: `postgres:17`
   - PersistentVolume on .12 `/mnt/datadisk/seam/postgres`
   - Node affinity: .12
   - Liveness/readiness: `pg_isready`
   - Two databases: `seam` (application) and `zitadel` (OIDC)

3. **Deploy Zitadel**:
   - Single Go binary, ~128MB RAM
   - External Postgres (the `zitadel` database from step 2)
   - Configure: project, application (public PKCE client), redirect URIs
   - Node affinity: .12 (co-locate with Postgres)

4. **Build and push Seam server image**:
   ```bash
   docker build -t 192.168.1.45:5000/seam/server:latest server/
   docker push 192.168.1.45:5000/seam/server:latest
   ```

5. **Deploy Seam server**:
   - Environment: `DATABASE_URL`, OIDC discovery URL (Zitadel), `CREDENTIAL_MASTER_KEY` (from volume mount)
   - Readiness probe: `GET /api/health`
   - Run migrations as init container or Job

6. **Deploy RabbitMQ + seam-worker**:
   - RabbitMQ with default credentials rotated
   - seam-worker connects to RabbitMQ and Postgres
   - `WORKER_API_TOKEN` for internal API calls

### Validation

- `curl http://seam-server.seam-core.svc:3002/api/health` returns 200
- Zitadel admin console accessible via port-forward
- Test user login flow works end-to-end (PKCE)
- Migrations applied successfully

### Artifacts to Create

- `server/Dockerfile` — multi-stage Rust build (builder + slim runtime)
- `infra/k8s/seam-core/postgres.yaml` — StatefulSet + PV + PVC + Service
- `infra/k8s/seam-core/zitadel.yaml` — Deployment + Service + ConfigMap
- `infra/k8s/seam-core/seam-server.yaml` — Deployment + Service
- `infra/k8s/seam-core/rabbitmq.yaml` — Deployment + Service
- `infra/k8s/seam-core/seam-worker.yaml` — Deployment
- `infra/k8s/seam-core/secrets.enc.yaml` — SOPS-encrypted secrets

---

## Phase 3: Coder Integration

**Goal**: Coder running in `seam-coder`, spawning workspace pods on .13 with full security controls.

See [ADR-006](adrs/ADR-006-workspace-security.md) for the workspace security model.

### Steps

1. **Deploy Coder with Kubernetes provisioner**:
   - Image: `ghcr.io/coder/coder:latest`
   - Postgres connection (same PG instance, `coder` database)
   - ServiceAccount with RBAC to manage pods in `seam-coder` only
   - Node affinity: .13

2. **Adapt Coder template for k8s provider**:
   - Convert `infra/coder/templates/seam-agent/main.tf` from Docker to Kubernetes provider
   - Per-pod resource limits (see ADR-006 Layer 2):
     ```hcl
     resources {
       requests = { cpu = "1", memory = "2Gi" }
       limits   = { cpu = "2", memory = "4Gi" }
     }
     ```
   - Inject `SEAM_TOKEN` as env var from server-generated agent token
   - Labels: `app.kubernetes.io/managed-by: coder` (matches CiliumNetworkPolicy selector)

3. **Implement token lifecycle** (see ADR-006 Layer 3):
   - Token `expires_at` set to workspace TTL (default: 2 hours)
   - Workspace stop/destroy triggers token revocation
   - One active token per workspace, no reuse across restarts

4. **Add MCP rate limiting** (see ADR-006 Layer 4):
   - Tower middleware in `mcp_auth.rs`
   - Per-token: 60 req/min, 500 req/hr
   - Global: 300 req/min
   - Alert threshold: >80% sustained for >5 minutes

5. **Configure workspace auto-stop**:
   - Idle detection: no MCP calls for 30 minutes
   - Auto-stop revokes token and frees resources

6. **Update Seam server config**:
   - `CODER_URL` pointing to Coder's internal service DNS
   - `CODER_TOKEN` from Coder API (stored in encrypted secrets)

### Validation

- Creating a workspace via Seam spawns a pod on .13
- Workspace pod can reach Seam MCP endpoint (`seam-server.seam-core.svc:3002`)
- Workspace pod **cannot** reach Postgres, Zitadel, or RabbitMQ (NetworkPolicy test)
- Workspace pod **cannot** reach arbitrary external hosts (egress test)
- Workspace pod **can** reach allowlisted hosts (api.anthropic.com, github.com, etc.)
- ResourceQuota prevents >8 concurrent workspace pods
- Token revocation on workspace stop confirmed
- Rate limiting returns 429 at threshold

### Artifacts to Create

- `infra/coder/templates/seam-agent/main.tf` — rewritten for k8s provider
- Rate limiting middleware in `server/src/mcp_auth.rs`
- Token TTL and auto-revocation in `server/src/agent_token.rs`
- Workspace auto-stop in `server/src/worker/scheduler.rs`

---

## Phase 4: Ingress and TLS

**Goal**: External HTTPS access via .14 Nginx.

See [ADR-004](adrs/ADR-004-tls-termination.md) for TLS termination decision.

### Steps

1. **Configure Traefik IngressRoutes** inside k3s:
   ```yaml
   # seam.poorlythoughtout.com -> seam-server:3002
   # auth.poorlythoughtout.com -> zitadel:8080
   # coder.poorlythoughtout.com -> coder:7080
   ```

2. **Add Nginx upstream blocks on .14**:
   ```nginx
   upstream seam_traefik {
       server 192.168.1.12:80;
       server 192.168.1.13:80 backup;
   }

   server {
       listen 443 ssl;
       server_name seam.poorlythoughtout.com;

       ssl_certificate     /etc/letsencrypt/live/poorlythoughtout.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/poorlythoughtout.com/privkey.pem;

       location / {
           proxy_pass http://seam_traefik;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location /ws {
           proxy_pass http://seam_traefik;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

   Repeat for `auth.poorlythoughtout.com` and `coder.poorlythoughtout.com`.

3. **Configure pfSense firewall**:
   - WAN :443 -> .14:443
   - No direct exposure of k3s API server (6443) to WAN
   - No direct exposure of any k3s NodePort to WAN

4. **DNS records** for `poorlythoughtout.com`:
   - `seam.poorlythoughtout.com` -> WAN IP
   - `auth.poorlythoughtout.com` -> WAN IP
   - `coder.poorlythoughtout.com` -> WAN IP

### Validation

- `curl https://seam.poorlythoughtout.com/api/health` returns 200
- Zitadel login flow works through `auth.poorlythoughtout.com`
- WebSocket connection to `/ws` upgrades successfully
- `nmap` confirms only 443 exposed externally

---

## Phase 5: Operational Readiness

**Goal**: Backups, monitoring, and incident response capability.

### Backups

1. **Postgres daily backup** (CronJob at 02:00 UTC):
   - `pg_dump` all three databases (seam, zitadel, coder)
   - Compress and ship to .34 NFS (`/backups/seam/`)
   - Retention: 7 daily + 4 weekly
   - Test restore monthly

2. **Zitadel configuration**: Exported as code (project/application config in `infra/k8s/seam-core/zitadel-config/`). Reconstructible from git.

3. **Secrets backup**: age private key stored in a separate, offline location (not on any server). Loss of this key requires re-creating all secrets.

### Monitoring

Minimal viable monitoring (avoid over-engineering):

- **Uptime checks**: Uptime Kuma on .40 pings `/api/health`, Zitadel health, Coder health
- **Node health**: Prometheus node-exporter on .12 and .13 (k3s has built-in metrics)
- **Disk alerts**: Alert if .12 `/mnt/datadisk` exceeds 80%
- **Workspace alerts**: Workspace running >2 hours without MCP activity, sustained high CPU without tool calls
- **Rate limit alerts**: Any token sustaining >80% of rate limit for >5 minutes

Full Prometheus + Grafana stack is deferred — add only if operational issues justify it.

### Incident Response

- **Compromised workspace**: Stop workspace (auto-revokes token), review `tool_invocations` log, check egress logs in Cilium
- **Rate limit breach**: Token auto-blocked, alert fires, review workspace activity
- **CREDENTIAL_MASTER_KEY exposure**: Rotate key, re-encrypt all credentials, revoke all agent tokens, rotate all stored API keys
- **Node failure**: seam-core workloads can reschedule to .13 (stateless); Postgres requires manual PV migration if .12 fails

---

## Artifact Inventory

All deployment manifests live under `infra/k8s/`:

```
infra/k8s/
+-- age.key                          (.gitignored)
+-- namespaces.yaml
+-- seam-core/
|   +-- postgres.yaml                (StatefulSet + PV + PVC + Service)
|   +-- zitadel.yaml                 (Deployment + Service + ConfigMap)
|   +-- seam-server.yaml             (Deployment + Service)
|   +-- seam-worker.yaml             (Deployment)
|   +-- rabbitmq.yaml                (Deployment + Service)
|   +-- ingress.yaml                 (IngressRoute for Traefik)
|   +-- secrets.enc.yaml             (SOPS-encrypted)
|   +-- postgres-backup.yaml         (CronJob)
|   +-- zitadel-config/              (Zitadel project/app config)
+-- seam-coder/
    +-- coder.yaml                   (Deployment + Service + ServiceAccount + RBAC)
    +-- network-policies.yaml        (default-deny + egress allowlist)
    +-- resource-quota.yaml
    +-- ingress.yaml
```

Additional artifacts:
- `server/Dockerfile` — multi-stage Rust build
- `infra/coder/templates/seam-agent/main.tf` — k8s provider template
- `.14 Nginx config` — managed on .14 directly (not in this repo)

## Open Items

These are implementation tasks, not decisions (decisions are in ADRs):

- [ ] Create `server/Dockerfile` (multi-stage Rust build)
- [ ] Write k8s manifests for all services
- [ ] Translate Keycloak realm config to Zitadel project/application config
- [ ] Implement MCP rate limiting middleware
- [ ] Implement token TTL and auto-revocation
- [ ] Implement workspace auto-stop (idle detection)
- [ ] Adapt Coder template for k8s provider
- [ ] Set up container registry auth (if using 192.168.1.45:5000, add TLS or configure insecure registry in k3s)
- [ ] Frontend hosting decision: embed static build in server binary, or serve from separate Nginx container
- [ ] Decide whether to migrate .12's media stack (Sonarr/Radarr) into k3s or leave as Docker Compose alongside

## ADR Index

| ADR | Decision |
|-----|----------|
| [ADR-001](adrs/ADR-001-k3s.md) | k3s for container orchestration |
| [ADR-002](adrs/ADR-002-self-hosted.md) | Self-hosted on home network |
| [ADR-003](adrs/ADR-003-oidc-provider.md) | Zitadel as OIDC provider |
| [ADR-004](adrs/ADR-004-tls-termination.md) | TLS termination at Nginx on .14 |
| [ADR-005](adrs/ADR-005-secrets-management.md) | SOPS + age for secrets |
| [ADR-006](adrs/ADR-006-workspace-security.md) | Agent workspace security model |
