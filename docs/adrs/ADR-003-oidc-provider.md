# ADR-003: OIDC Provider Selection

**Status**: Proposed
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
| Authelia | Self-hosted | Low (Go binary) | Free | Primarily an auth proxy; OIDC support is newer |
| Cloudflare Access | Managed | None (SaaS) | Free tier (50 users) | Zero infra, but locks into Cloudflare ecosystem |

## Decision

Use **Zitadel** as the production OIDC provider.

## Rationale

- **Lightweight**: Single Go binary, ~128MB RAM — fraction of Keycloak's footprint
- **OIDC-native**: Built for OIDC/OAuth2 from the ground up, not bolted on
- **Postgres-backed**: Shares our existing Postgres instance (separate database), no additional storage infrastructure
- **Self-hosted**: No vendor lock-in, no external dependency for auth
- **Migration path**: Standard OIDC — if Zitadel proves insufficient, any other provider can replace it without Seam server changes
- Cloudflare Access was tempting (zero infra) but creates an external dependency for a security-critical service and complicates local development

## Consequences

- Must create Zitadel deployment manifests (replaces Keycloak manifests)
- Realm/client configuration from `infra/keycloak/realm-export.json` must be translated to Zitadel project/application config
- Dev environment can continue using Keycloak or switch to Zitadel — the Seam server doesn't care as long as JWKS works
- Zitadel shares the Postgres instance: simpler infrastructure, but backup/restore must account for both databases
