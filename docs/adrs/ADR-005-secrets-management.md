# ADR-005: Secrets Management via AWS Secrets Manager

**Status**: Accepted (supersedes previous SOPS+age decision)
**Date**: 2026-03-06
**Deciders**: ty

## Context

Seam manages several categories of secrets:

| Secret | Sensitivity | Blast Radius |
|--------|------------|--------------|
| `CREDENTIAL_MASTER_KEY` (Fernet) | Critical | Decrypts ALL org and user API keys (Anthropic, OpenAI, git tokens) |
| Database credentials | High | Full database access |
| OIDC provider admin password | High | Auth system control |
| Coder API token | High | Can spawn arbitrary workspaces |
| Agent tokens (`sat_` prefix) | Medium | MCP access scoped to session |

The `CREDENTIAL_MASTER_KEY` is the crown jewel — compromise means all stored credentials are exposed. It must never appear in git, environment variable logs, or k8s manifest files.

## Decision

Use **AWS Secrets Manager** with the **External Secrets Operator (ESO)** to sync secrets into k8s.

## Rationale

- **Encryption at rest**: Secrets Manager encrypts with KMS — no plaintext secrets anywhere in the deployment pipeline
- **Automatic rotation**: Native rotation support for RDS credentials; custom rotation lambdas for other secrets
- **Audit trail**: Every secret access is logged in CloudTrail — critical for incident response
- **IRSA access control**: Pods access secrets via IAM roles (no static credentials), scoped per-service
- **ESO bridge**: External Secrets Operator syncs Secrets Manager values into k8s Secrets automatically, keeping k8s manifests secret-free
- SOPS+age is simpler but lacks rotation, audit logging, and centralized management

## Implementation

- `CREDENTIAL_MASTER_KEY` stored in its own Secrets Manager secret with restricted IAM policy (only seam-server pod role)
- Mounted as a volume via ESO SecretStore, not as an env var — reduces exposure in process listings and crash dumps
- RDS credentials managed via Secrets Manager native rotation (rotates every 30 days)
- All secret access requires IRSA — no k8s ServiceAccount can read secrets without an explicit IAM role binding

## Consequences

- Secrets Manager cost (~$0.40/secret/month + $0.05/10k API calls) — negligible
- External Secrets Operator adds a cluster component to maintain
- Secret rotation requires testing to ensure dependent services handle credential changes gracefully
- CloudTrail logs provide forensic capability for secret access audits
- Developers need AWS credentials to manage secrets (no local-only workflow)
