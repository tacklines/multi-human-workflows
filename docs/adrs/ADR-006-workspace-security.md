# ADR-006: Agent Workspace Security Model

**Status**: Accepted
**Date**: 2026-03-06
**Deciders**: ty

## Context

Coder spawns agent workspace pods that execute arbitrary code on behalf of AI agents. These workspaces are the platform's largest attack surface. A compromised or misbehaving workspace can:

- **Mine cryptocurrency** until resource limits are hit — costs compound over time
- **Abuse injected API keys** (Anthropic, OpenAI) to run expensive model calls — costs compound per-token
- **Exfiltrate data** from the knowledge base or other sessions via MCP tools
- **Lateral move** to platform services (Postgres, OIDC provider) if network isolation is absent
- **Spam MCP endpoints** to degrade platform availability

Resource exploits have **compounding costs** — unlike a simple data breach, ongoing compute and API abuse generates continuous financial damage until detected and stopped.

## Decision

Implement defense-in-depth across six layers: network isolation, resource limits, token lifecycle, rate limiting, egress control, and audit/detection.

## Layer 1: Network Isolation

Workspace pods run in a dedicated `seam-coder` namespace with default-deny networking:

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

**Allowed egress from workspace pods:**
- Seam MCP endpoint (`seam-server.seam-core.svc:3002`) — required for agent operation
- DNS (`kube-dns.kube-system.svc:53`) — required for service resolution
- External allowlist (see Layer 5)

**Blocked:**
- All access to `seam-core` namespace except the MCP endpoint
- Direct access to Postgres, OIDC provider, or any other platform service
- Pod-to-pod communication within `seam-coder` (workspace isolation)

On EKS, VPC security groups per pod (via SecurityGroupPolicy) provide an additional isolation layer at the VPC level.

## Layer 2: Resource Limits

Two levels of enforcement:

**Per-pod limits** (set in Coder template):
```yaml
resources:
  requests:
    cpu: "1"
    memory: 2Gi
  limits:
    cpu: "2"
    memory: 4Gi
```

**Namespace quota** (ceiling for all workspace pods combined):
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

Per-pod limits prevent any single workspace from claiming the whole quota. The namespace quota caps total workspace compute cost. Workspace node groups use separate instance types with cost alarms.

## Layer 3: Token Lifecycle

Agent tokens (`sat_` prefix) are scoped and short-lived:

- **TTL**: Token expires when workspace is stopped or destroyed. `agent_tokens` table tracks `expires_at`.
- **Auto-revocation**: Workspace stop/destroy triggers token revocation in the same transaction.
- **Session-scoped**: Token is valid only for the session it was created for. `join_session` validates token-session binding.
- **One active token per workspace**: Creating a new token for a workspace revokes the previous one.
- **No token reuse**: Tokens are single-use per workspace lifecycle. Restarting a workspace issues a new token.

Implementation: `agent_token.rs` create/validate/revoke functions enforce these constraints. The Coder template injects `SEAM_TOKEN` at workspace provision time.

## Layer 4: MCP Rate Limiting

Rate limits on the `/mcp` endpoint prevent tool-call abuse:

| Scope | Limit | Window |
|-------|-------|--------|
| Per-token | 60 requests | 1 minute |
| Per-token | 500 requests | 1 hour |
| Global (all agents) | 300 requests | 1 minute |

Implementation: Tower middleware in `mcp_auth.rs` using in-memory token bucket (or Redis/ElastiCache if scaling beyond single-server). Returns `429 Too Many Requests` with `Retry-After` header.

Alerts fire when any token sustains >80% of its rate limit for >5 minutes (indicates possible abuse or runaway agent loop).

## Layer 5: Egress Control

Workspace pods may only reach a curated allowlist of external hosts:

| Destination | Port | Purpose |
|-------------|------|---------|
| `api.anthropic.com` | 443 | Claude API calls |
| `api.openai.com` | 443 | OpenAI API calls (if configured) |
| `github.com` | 443 | Git clone/push |
| `registry.npmjs.org` | 443 | npm package installs |
| `crates.io`, `static.crates.io` | 443 | Cargo dependency fetches |
| `pypi.org`, `files.pythonhosted.org` | 443 | pip installs |

Standard Kubernetes NetworkPolicy cannot filter by hostname (only IP/CIDR). Implementation options:

- **Cilium** (EKS add-on, supports FQDN-based policies) — preferred
- **Calico Enterprise** (FQDN policies via DNS policy)
- **NAT Gateway + VPC egress filtering** — coarser-grained but no CNI change required

Decision: Use **Cilium** as the EKS CNI for FQDN-based egress policies. Must be configured at cluster creation time.

## Layer 6: Audit and Detection

Reactive controls complement preventive ones:

- **Tool invocation logging**: All MCP tool calls are stored in `tool_invocations` table with participant_id, tool_name, timestamp, and duration
- **Cost tracking**: LLM API calls through injected credentials should be tracked (see backlog)
- **Anomaly alerts**: Workspace running >2 hours without MCP activity, sustained high CPU without tool calls, unusual egress volume
- **Workspace auto-stop**: Idle workspaces (no MCP calls for 30 minutes) are automatically stopped, revoking their token
- **CloudTrail**: All AWS API calls logged for forensic analysis
- **VPC Flow Logs**: Network traffic visibility for workspace subnets

## Consequences

- Cilium CNI must be chosen at EKS cluster creation — cannot be retrofitted easily
- Per-pod resource limits may need tuning as we learn actual agent workload profiles
- Rate limits may need adjustment — too aggressive blocks legitimate agent work, too loose allows abuse
- Egress allowlist will need maintenance as agents require new external services
- Token TTL and auto-revocation add complexity to the workspace lifecycle code path
- Defense-in-depth means no single layer failure is catastrophic — each layer independently limits blast radius
