# ADR-004: Ingress and TLS via AWS ALB + ACM

**Status**: Accepted (supersedes previous Nginx decision)
**Date**: 2026-03-06
**Deciders**: ty

## Context

External HTTPS access requires TLS termination and ingress routing. On EKS, the primary options are:

1. **AWS ALB + ACM** — Managed load balancer with free, auto-renewing TLS certificates via AWS Certificate Manager
2. **Nginx Ingress Controller + cert-manager** — Self-managed ingress with Let's Encrypt certificates
3. **Traefik + cert-manager** — Similar to Nginx but with different feature set

## Decision

Use **AWS Application Load Balancer (ALB)** with **ACM certificates** via the **aws-load-balancer-controller**.

## Rationale

- **Zero cert management**: ACM certificates are free, auto-renewing, and require no in-cluster certificate infrastructure
- **Native integration**: aws-load-balancer-controller maps Ingress resources directly to ALB target groups
- **WebSocket support**: ALB natively handles WebSocket upgrade for Seam's `/ws` endpoint
- **WAF integration**: AWS WAF can be attached to the ALB for additional protection (rate limiting, geo-blocking, bot mitigation)
- **Health checks**: ALB health checks integrate with EKS pod readiness, enabling zero-downtime deployments
- Nginx/Traefik would work but add operational overhead (cert-manager, ingress controller updates, TLS config) for no clear benefit on AWS

## Traffic Path

```
Internet -> Route 53 -> ALB (TLS termination, ACM cert) -> Target Group -> Pod
```

## Consequences

- ALB cost (~$16/mo base + $5-8/LCU-hour for traffic)
- One ALB can serve multiple hostnames via Ingress rules (seam, auth, coder subdomains)
- AWS-specific ingress — portable k8s Ingress annotations, but ALB-specific features (WAF, Cognito auth) don't transfer
- Internal cluster traffic is unencrypted (ALB to pod is HTTP within VPC — acceptable for private subnets)
