# Deployment Plan: Seam Platform on EKS

**Status**: Draft
**Date**: 2026-03-06
**Last Updated**: 2026-03-06

## Overview

Deploy Seam to Amazon EKS with security as a cross-cutting concern from Phase 1 onward. Agent workspaces execute untrusted code — every phase accounts for isolation, resource control, and blast radius containment.

See [ADR-001](adrs/ADR-001-k3s.md) for the EKS decision, [ADR-002](adrs/ADR-002-self-hosted.md) for managed services strategy.

## Cluster Layout

```
EKS Cluster (Cilium CNI)
|
+-- namespace: seam-core
|   +-- Deployment: seam-server (Rust API)
|   +-- Deployment: seam-worker (event bridge + scheduler)
|   +-- Deployment: zitadel (OIDC)
|   +-- Deployment: rabbitmq
|   +-- ExternalSecret: credentials (from AWS Secrets Manager)
|   +-- [RDS PostgreSQL — external, VPC-internal]
|
+-- namespace: seam-coder
|   +-- Deployment: coder
|   +-- ResourceQuota: workspace limits
|   +-- NetworkPolicy: default-deny-all
|   +-- CiliumNetworkPolicy: egress allowlist
|   +-- (Coder-spawned workspace pods)
|
+-- namespace: seam-system
    +-- Deployment: external-secrets-operator
    +-- Deployment: aws-load-balancer-controller
```

### Node Groups

| Node Group | Instance Type | Purpose | Scaling |
|------------|--------------|---------|---------|
| platform | t3.large (2 vCPU / 8 GB) | seam-core workloads | Fixed 2 nodes (HA) |
| workspace | c5.xlarge (4 vCPU / 8 GB) | Coder workspace pods | Autoscale 0-4 (scale to zero when idle) |

Platform and workspace node groups run in separate subnets for VPC-level isolation.

### Traffic Path

```
Internet -> Route 53 -> ALB (TLS via ACM) -> Target Group -> Pod
```

See [ADR-004](adrs/ADR-004-tls-termination.md) for ingress decision.

---

## Phase 1: EKS Cluster Bootstrap

**Goal**: Standing EKS cluster with Cilium CNI, namespace isolation, and workspace security boundaries.

### Steps

1. **Provision EKS cluster** (Terraform/OpenTofu):
   - Kubernetes 1.30+
   - Cilium CNI (disable default VPC CNI, see [ADR-006](adrs/ADR-006-workspace-security.md) Layer 5)
   - OIDC provider enabled (for IRSA)
   - Private endpoint + public endpoint with CIDR restriction
   - Encryption: envelope encryption for k8s secrets via KMS

2. **Create node groups**:
   - `platform` node group in private subnets (seam-core workloads)
   - `workspace` node group in separate private subnets (Coder workspace pods)
   - Workspace nodes labeled `role=workspace` for node affinity

3. **Create namespaces with baseline security**:
   ```bash
   kubectl create namespace seam-core
   kubectl create namespace seam-coder
   kubectl create namespace seam-system
   ```

4. **Apply default-deny NetworkPolicy** to `seam-coder`:
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

5. **Apply workspace egress allowlist** (CiliumNetworkPolicy):
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

6. **Apply ResourceQuota** to `seam-coder`:
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

7. **Install cluster components** (Helm):
   - aws-load-balancer-controller (for ALB Ingress)
   - External Secrets Operator (for Secrets Manager sync)

### Validation

- `kubectl get nodes` shows platform and workspace node groups
- `cilium status` healthy
- NetworkPolicy blocks cross-namespace traffic from `seam-coder` to `seam-core` (test with a temporary pod)
- ALB controller and ESO pods running in `seam-system`

### Artifacts to Create

- `infra/terraform/` — EKS cluster, VPC, node groups, IAM roles
- `infra/k8s/namespaces.yaml`
- `infra/k8s/seam-coder/network-policies.yaml`
- `infra/k8s/seam-coder/resource-quota.yaml`

---

## Phase 2: Platform Services

**Goal**: RDS, Zitadel, Seam server, and RabbitMQ running in `seam-core`.

See [ADR-003](adrs/ADR-003-oidc-provider.md) for OIDC provider choice, [ADR-005](adrs/ADR-005-secrets-management.md) for secrets approach.

### Prerequisites

- Phase 1 complete
- Secrets created in AWS Secrets Manager
- Seam server container image pushed to ECR
- RDS instance provisioned via Terraform

### Steps

1. **Provision RDS PostgreSQL** (Terraform):
   - Engine: PostgreSQL 17
   - Instance: db.t4g.small (burstable, right-size later)
   - Multi-AZ: disabled initially (enable when justified)
   - Encryption at rest: enabled (KMS)
   - VPC security group: allow inbound from platform node group subnets only
   - Databases: `seam`, `zitadel`
   - Credentials managed via Secrets Manager with automatic rotation (30-day)

2. **Create secrets in AWS Secrets Manager**:
   - `seam/credential-master-key` — restricted IAM policy (seam-server role only)
   - `seam/rds-credentials` — auto-rotated by Secrets Manager
   - `seam/zitadel-admin` — Zitadel bootstrap credentials
   - `seam/rabbitmq` — RabbitMQ credentials
   - `seam/coder-api-token` — set in Phase 3

3. **Deploy External Secrets** (SecretStore + ExternalSecret resources):
   ```yaml
   apiVersion: external-secrets.io/v1beta1
   kind: SecretStore
   metadata:
     name: aws-secrets
     namespace: seam-core
   spec:
     provider:
       aws:
         service: SecretsManager
         region: us-east-1
         auth:
           jwt:
             serviceAccountRef:
               name: seam-server
   ```

4. **Deploy Zitadel**:
   - Helm chart or Deployment manifest
   - External Postgres (RDS, `zitadel` database)
   - Configure: project, application (public PKCE client), redirect URIs
   - Node affinity: platform node group

5. **Build and push Seam server image**:
   ```bash
   docker build -t <account>.dkr.ecr.<region>.amazonaws.com/seam/server:latest server/
   docker push <account>.dkr.ecr.<region>.amazonaws.com/seam/server:latest
   ```

6. **Deploy Seam server**:
   - IRSA: service account with permissions to read its specific secrets only
   - `CREDENTIAL_MASTER_KEY` mounted as volume from ESO-synced Secret (not env var)
   - Readiness probe: `GET /api/health`
   - Run migrations as init container or Job
   - Node affinity: platform node group

7. **Deploy RabbitMQ** (Bitnami Helm chart):
   - Persistent volume via EBS CSI driver
   - Credentials from Secrets Manager via ESO

8. **Deploy seam-worker**:
   - Connects to RabbitMQ and RDS
   - `WORKER_API_TOKEN` from Secrets Manager

### Validation

- Seam server health check returns 200
- Zitadel admin console accessible via port-forward
- Test user login flow works end-to-end (PKCE)
- Migrations applied successfully
- ESO SecretStore status is `Valid`

### Artifacts to Create

- `server/Dockerfile` — multi-stage Rust build
- `infra/terraform/rds.tf` — RDS instance
- `infra/terraform/ecr.tf` — Container registry
- `infra/terraform/secrets.tf` — Secrets Manager resources + IAM policies
- `infra/k8s/seam-core/` — Deployment manifests for all services
- `infra/k8s/seam-core/external-secrets.yaml` — SecretStore + ExternalSecret resources

---

## Phase 3: Coder Integration

**Goal**: Coder spawning workspace pods on workspace node group with full security controls.

See [ADR-006](adrs/ADR-006-workspace-security.md) for the workspace security model.

### Steps

1. **Deploy Coder** (Helm chart):
   - Postgres connection (RDS, `coder` database)
   - ServiceAccount with RBAC scoped to `seam-coder` namespace only
   - IRSA for ECR image pulls (workspace images)
   - Node affinity: platform node group (Coder control plane, not workspaces)

2. **Adapt Coder template for k8s provider**:
   - Convert `infra/coder/templates/seam-agent/main.tf` from Docker to Kubernetes provider
   - Per-pod resource limits (see ADR-006 Layer 2):
     ```hcl
     resources {
       requests = { cpu = "1", memory = "2Gi" }
       limits   = { cpu = "2", memory = "4Gi" }
     }
     ```
   - Node affinity: workspace node group (`role=workspace`)
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
   - Workspace node group scales to zero when no pods are running

6. **Store Coder API token in Secrets Manager**:
   - `seam/coder-api-token` secret
   - Seam server accesses via IRSA

### Validation

- Creating a workspace via Seam spawns a pod on workspace node group
- Workspace pod can reach Seam MCP endpoint
- Workspace pod **cannot** reach RDS, Zitadel, or RabbitMQ (NetworkPolicy test)
- Workspace pod **cannot** reach arbitrary external hosts (egress test)
- Workspace pod **can** reach allowlisted hosts (api.anthropic.com, github.com, etc.)
- ResourceQuota prevents >8 concurrent workspace pods
- Token revocation on workspace stop confirmed
- Rate limiting returns 429 at threshold
- Workspace node group scales to zero after all workspaces stop

### Artifacts to Create

- `infra/coder/templates/seam-agent/main.tf` — rewritten for k8s provider
- Rate limiting middleware in `server/src/mcp_auth.rs`
- Token TTL and auto-revocation in `server/src/agent_token.rs`
- Workspace auto-stop in `server/src/worker/scheduler.rs`

---

## Phase 4: Ingress and DNS

**Goal**: External HTTPS access via ALB with ACM certificates.

See [ADR-004](adrs/ADR-004-tls-termination.md) for ingress decision.

### Steps

1. **Provision ACM certificate** (Terraform):
   - Wildcard cert for `*.seam.example.com` (or project domain)
   - DNS validation via Route 53

2. **Create ALB Ingress resources**:
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: seam-ingress
     namespace: seam-core
     annotations:
       alb.ingress.kubernetes.io/scheme: internet-facing
       alb.ingress.kubernetes.io/target-type: ip
       alb.ingress.kubernetes.io/certificate-arn: <acm-cert-arn>
       alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
       alb.ingress.kubernetes.io/ssl-redirect: "443"
   spec:
     ingressClassName: alb
     rules:
       - host: app.seam.example.com
         http:
           paths:
             - path: /
               pathType: Prefix
               backend:
                 service:
                   name: seam-server
                   port:
                     number: 3002
       - host: auth.seam.example.com
         http:
           paths:
             - path: /
               pathType: Prefix
               backend:
                 service:
                   name: zitadel
                   port:
                     number: 8080
       - host: coder.seam.example.com
         http:
           paths:
             - path: /
               pathType: Prefix
               backend:
                 service:
                   name: coder
                   port:
                     number: 7080
   ```

3. **Configure Route 53**:
   - CNAME/alias records pointing subdomains to ALB DNS name
   - Managed via Terraform (external-dns is optional)

4. **Attach WAF** (optional but recommended):
   - Rate limiting rule: 1000 requests/5 min per IP
   - Geo-blocking if user base is regional
   - AWS managed rule groups: AWSManagedRulesCommonRuleSet

### Validation

- `curl https://app.seam.example.com/api/health` returns 200
- Zitadel login flow works through `auth.seam.example.com`
- WebSocket connection to `/ws` upgrades successfully
- ACM certificate shows `Issued` status
- WAF blocks synthetic attack traffic (if enabled)

### Artifacts to Create

- `infra/terraform/alb.tf` — ACM cert, Route 53 records
- `infra/k8s/seam-core/ingress.yaml`
- `infra/terraform/waf.tf` — WAF rules (optional)

---

## Phase 5: Operational Readiness

**Goal**: Backups, monitoring, cost controls, and incident response capability.

### Backups

1. **RDS automated backups**:
   - Retention: 7 days (configurable)
   - Point-in-time recovery enabled
   - Snapshot before major migrations
   - Test restore quarterly

2. **Zitadel configuration**: Exported as code (project/application config in `infra/k8s/seam-core/zitadel-config/`). Reconstructible from git.

3. **EBS snapshots**: Automated snapshots for RabbitMQ persistent volumes via AWS Backup.

### Monitoring

Minimal viable monitoring:

- **CloudWatch Container Insights**: Node and pod metrics, log aggregation
- **Uptime checks**: Route 53 health checks on `/api/health`, Zitadel health, Coder health
- **Cost alarms**: AWS Budgets alert at 80% and 100% of monthly target
  - Separate alarm for workspace node group compute (the runaway risk)
- **Workspace alerts**: Workspace running >2 hours without MCP activity, sustained high CPU without tool calls
- **Rate limit alerts**: Any token sustaining >80% of rate limit for >5 minutes
- **RDS alerts**: Connection count, CPU, free storage space

Full Prometheus + Grafana stack deferred — add only if CloudWatch proves insufficient.

### Cost Controls

- **Workspace node group**: Cluster Autoscaler scales to zero when no workspaces are running
- **Spot instances**: Workspace node group uses spot instances (workspaces are ephemeral, interruption-tolerant)
- **RDS**: Start with db.t4g.small, right-size based on actual load
- **NAT Gateway**: Single AZ initially (multi-AZ when justified) — NAT is a significant cost driver
- **AWS Budgets**: Hard alert at monthly spend ceiling

### Incident Response

- **Compromised workspace**: Stop workspace (auto-revokes token), review `tool_invocations` log, check VPC Flow Logs and Cilium egress logs
- **Rate limit breach**: Token auto-blocked, alert fires, review workspace activity
- **CREDENTIAL_MASTER_KEY exposure**: Rotate key in Secrets Manager, re-encrypt all credentials, revoke all agent tokens, rotate all stored API keys
- **Cost anomaly**: CloudWatch anomaly detection triggers SNS alert, investigate workspace node group scaling and egress patterns

---

## Artifact Inventory

```
infra/
+-- terraform/
|   +-- main.tf                      (VPC, subnets, security groups)
|   +-- eks.tf                       (EKS cluster, node groups, IRSA roles)
|   +-- rds.tf                       (PostgreSQL instance)
|   +-- ecr.tf                       (Container registries)
|   +-- secrets.tf                   (Secrets Manager resources + IAM)
|   +-- alb.tf                       (ACM cert, Route 53 records)
|   +-- waf.tf                       (WAF rules, optional)
|   +-- variables.tf
|   +-- outputs.tf
|
+-- k8s/
|   +-- namespaces.yaml
|   +-- seam-core/
|   |   +-- seam-server.yaml         (Deployment + Service)
|   |   +-- seam-worker.yaml         (Deployment)
|   |   +-- zitadel.yaml             (Deployment + Service + ConfigMap)
|   |   +-- rabbitmq.yaml            (Helm values or Deployment)
|   |   +-- external-secrets.yaml    (SecretStore + ExternalSecret)
|   |   +-- ingress.yaml             (ALB Ingress)
|   |   +-- zitadel-config/          (Zitadel project/app config)
|   +-- seam-coder/
|   |   +-- coder.yaml               (Helm values or Deployment + RBAC)
|   |   +-- network-policies.yaml    (default-deny + egress allowlist)
|   |   +-- resource-quota.yaml
|   +-- seam-system/
|       +-- external-secrets-operator.yaml  (Helm values)
|       +-- aws-lb-controller.yaml          (Helm values)
|
+-- coder/
    +-- templates/seam-agent/main.tf  (k8s provider template)
```

Additional artifacts:
- `server/Dockerfile` — multi-stage Rust build

## Open Items

Implementation tasks (decisions are in ADRs):

- [ ] Create `server/Dockerfile` (multi-stage Rust build)
- [ ] Write Terraform modules for VPC, EKS, RDS, ECR
- [ ] Write k8s manifests for all services
- [ ] Translate Keycloak realm config to Zitadel project/application config
- [ ] Implement MCP rate limiting middleware
- [ ] Implement token TTL and auto-revocation
- [ ] Implement workspace auto-stop (idle detection)
- [ ] Adapt Coder template for k8s provider
- [ ] Set up CI/CD pipeline (build image -> push ECR -> deploy manifests)
- [ ] Frontend hosting: embed static build in server binary or serve from S3+CloudFront
- [ ] Choose domain and set up Route 53 hosted zone

## ADR Index

| ADR | Decision |
|-----|----------|
| [ADR-001](adrs/ADR-001-k3s.md) | EKS for container orchestration |
| [ADR-002](adrs/ADR-002-self-hosted.md) | Managed services for stateful infrastructure |
| [ADR-003](adrs/ADR-003-oidc-provider.md) | Zitadel as OIDC provider |
| [ADR-004](adrs/ADR-004-tls-termination.md) | ALB + ACM for ingress and TLS |
| [ADR-005](adrs/ADR-005-secrets-management.md) | AWS Secrets Manager + External Secrets Operator |
| [ADR-006](adrs/ADR-006-workspace-security.md) | Agent workspace security model |
