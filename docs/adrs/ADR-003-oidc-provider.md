# ADR-003: OIDC Provider Selection

**Status**: Superseded (2026-03-07) — replaced by Ory Hydra + Kratos. See `docs/plan-ory-migration.md`.
**Date**: 2026-03-06
**Deciders**: ty

## Context

Seam requires OIDC authentication. The server validates JWTs via a JWKS endpoint and standard OIDC claims — it is **not coupled to any specific provider**. The current dev setup uses Keycloak, but production needs the cheapest, easiest option that is OIDC-compliant.

Keycloak is heavyweight: Java-based, high memory footprint (~512MB-1GB), complex admin UI, more features than we need.

## Options Evaluated

| Provider | Type | Footprint | Cost | Notes |
|----------|------|-----------|------|-------|
| Keycloak | Self-hosted | High (Java, ~1GB RAM) | Free | Feature-rich but heavy; current dev setup |
| Zitadel | Self-hosted | Low (Go binary, ~128MB) | Free | OIDC-native, Postgres-backed, lightweight |
| Authentik | Self-hosted | Medium (Python/Django) | Free | Good UI, broader feature set than needed |
| Amazon Cognito | Managed | None (SaaS) | Free tier (50k MAU) | Zero infra, but limited customization and AWS-specific |
| Cloudflare Access | Managed | None (SaaS) | Free tier (50 users) | Zero infra, but locks into Cloudflare ecosystem |

## Decision

Use **Zitadel** as the production OIDC provider.

## Rationale

- **Lightweight**: Single Go binary, ~128MB RAM — fraction of Keycloak's footprint
- **OIDC-native**: Built for OIDC/OAuth2 from the ground up, not bolted on
- **Postgres-backed**: Uses the existing RDS instance (separate database), no additional storage infrastructure
- **Portable**: No vendor lock-in to any cloud provider
- **Migration path**: Standard OIDC — if Zitadel proves insufficient, any other provider (including Cognito) can replace it without Seam server changes
- Cognito was tempting (zero infra) but its OIDC customization is limited and creates an AWS-specific dependency for a security-critical service

## Consequences (original, now moot)

- Must create Zitadel k8s deployment manifests
- Realm/client configuration from `infra/keycloak/realm-export.json` must be translated to Zitadel project/application config
- Dev environment can continue using Keycloak — the Seam server doesn't care as long as JWKS works
- Zitadel shares the RDS instance: simpler infrastructure, but backup/restore must account for both databases

## Superseded

Zitadel was never deployed. The project migrated directly from Keycloak to **Ory Hydra + Kratos** (2026-03-07):

- **Hydra** handles OAuth2/OIDC (token issuance, JWKS, client management, Dynamic Client Registration)
- **Kratos** handles identity management (registration, login, password hashing, account recovery)
- Seam server bridges the two via Hydra admin API for login/consent flows
- See `docs/plan-ory-migration.md` for the migration plan and `docs/ory-auth-guide.md` for operational details
