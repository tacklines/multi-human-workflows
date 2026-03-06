# ADR-005: Secrets Management

**Status**: Proposed
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

## Options Evaluated

1. **Kubernetes Secrets (base64)** — Built-in, no additional tooling. Not encrypted at rest by default.
2. **Sealed Secrets (Bitnami)** — Encrypt secrets in git, decrypt only in-cluster. Controller manages lifecycle.
3. **SOPS + age** — Encrypt secret files with age keys before committing. Decrypt at deploy time.
4. **External Secrets Operator + Infisical** — Pull secrets from Infisical (running on .40) into k8s Secrets automatically.

## Decision

Use **SOPS + age** for secret encryption in git, with k8s Secrets as the runtime delivery mechanism. Evaluate External Secrets Operator with Infisical as a future upgrade.

## Rationale

- **SOPS + age** is simple: one age key per environment, encrypt YAML files in-place, decrypt during `kubectl apply`
- No additional in-cluster controller (unlike Sealed Secrets or External Secrets Operator)
- Secrets are version-controlled (encrypted) alongside manifests — deployment is self-contained
- age keys are small and easy to back up securely (single file)
- Infisical on .40 exists but adding External Secrets Operator increases cluster complexity for marginal benefit at current scale

## Implementation

- Generate an age key pair for production: `age-keygen -o infra/k8s/age.key` (this file is .gitignored)
- Encrypt secret manifests: `sops --encrypt --age <public-key> secrets.yaml > secrets.enc.yaml`
- Deploy script decrypts and applies: `sops --decrypt secrets.enc.yaml | kubectl apply -f -`
- `CREDENTIAL_MASTER_KEY` stored in a dedicated Secret, mounted as a volume (not an env var) to reduce exposure in process listings and crash dumps

## Consequences

- The age private key becomes a critical backup item — loss means re-creating all secrets
- Developers must have `sops` and `age` installed locally to update secrets
- Secret rotation requires re-encrypting and redeploying — no automatic rotation
- Upgrade path: External Secrets Operator + Infisical if secret count or rotation frequency grows
