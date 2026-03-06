# ADR-004: TLS Termination at Nginx on .14

**Status**: Accepted
**Date**: 2026-03-05
**Deciders**: ty

## Context

External HTTPS access requires TLS termination somewhere in the request path. Two options:

1. **Nginx on .14** — .14 already runs Nginx with Let's Encrypt certs for `*.poorlythoughtout.com`. Add upstream blocks to proxy to k3s Traefik.
2. **cert-manager inside k3s** — Install cert-manager, create ClusterIssuer for Let's Encrypt, annotate Ingress resources. Requires port 80/443 forwarded directly to k3s nodes.

## Decision

Terminate TLS at **Nginx on .14**, proxying to k3s Traefik via NodePort.

## Rationale

- **Reuses existing infrastructure**: .14 already has Nginx, certs, and renewal automation in place
- **One less component inside k3s**: No cert-manager, no ClusterIssuer, no cert-related debugging
- **Separation of concerns**: External TLS at the network edge (.14), internal routing at the cluster (Traefik)
- **WebSocket support**: Nginx config explicitly handles `/ws` upgrade headers for Seam's real-time features

## Traffic Path

```
Internet -> pfSense :443 -> .14 Nginx (TLS termination) -> k3s Traefik (NodePort on .12/.13) -> Service
```

## Consequences

- .14 becomes a single point of ingress — if it goes down, no external access (acceptable for current scale)
- Internal cluster traffic is unencrypted (Nginx to Traefik is HTTP within the trusted LAN)
- Nginx config on .14 must be maintained manually (not managed by k8s)
- Adding new subdomains (e.g., `coder.poorlythoughtout.com`) requires an Nginx server block update on .14
