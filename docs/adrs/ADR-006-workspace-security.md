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

Implement defense-in-depth across five layers: network isolation, resource limits, token lifecycle, rate limiting, and egress control.

## Layer 1: Network Isolation (NetworkPolicy)

Workspace pods in `seam-coder` namespace are denied all traffic by default, with explicit allowances:

```yaml
# Default deny all ingress and egress in seam-coder
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
- External allowlist (see Layer 5) — required for package installs and API calls

**Blocked:**
- All access to `seam-core` namespace except the MCP endpoint
- Direct access to Postgres, OIDC provider, or any other platform service
- Pod-to-pod communication within `seam-coder` (workspace isolation)

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

Per-pod limits prevent any single workspace from claiming the whole quota. The namespace quota prevents total workspace resource consumption from starving the node.

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

Implementation: Tower middleware in `mcp_auth.rs` using in-memory token bucket (or Redis if scaling beyond single-server). Returns `429 Too Many Requests` with `Retry-After` header.

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

Implementation: Kubernetes NetworkPolicy cannot filter by hostname (only IP/CIDR). Options:
- **Cilium** (replaces kube-proxy, supports FQDN-based policies) — preferred
- **Istio egress gateway** — heavier, more operational overhead
- **Squid proxy** — transparent HTTP proxy with domain allowlist, workspace pods route through it

Decision: Deploy **Cilium** as the k3s CNI (replaces default Flannel) for FQDN-based egress policies. This is a Phase 1 decision — must be configured at cluster bootstrap time.

## Layer 6: Audit and Detection

Reactive controls complement preventive ones:

- **Tool invocation logging**: All MCP tool calls are stored in `tool_invocations` table with participant_id, tool_name, timestamp, and duration
- **Cost tracking**: LLM API calls through injected credentials should be tracked (see seam-31 in backlog)
- **Anomaly alerts**: Workspace running >2 hours without MCP activity, sustained high CPU without tool calls, unusual egress volume
- **Workspace auto-stop**: Idle workspaces (no MCP calls for 30 minutes) are automatically stopped, revoking their token

## Consequences

- Cilium CNI must be chosen at k3s bootstrap (Phase 1) — cannot be retrofitted easily
- Per-pod resource limits may need tuning as we learn actual agent workload profiles
- Rate limits may need adjustment — too aggressive blocks legitimate agent work, too loose allows abuse
- Egress allowlist will need maintenance as agents require new external services
- Token TTL and auto-revocation add complexity to the workspace lifecycle code path
- Defense-in-depth means no single layer failure is catastrophic — each layer independently limits blast radius
