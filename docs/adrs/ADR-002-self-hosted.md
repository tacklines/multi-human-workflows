# ADR-002: Self-Hosted Deployment on Home Network

**Status**: Accepted
**Date**: 2026-03-05
**Deciders**: ty

## Context

Seam needs a deployment target beyond local dev. Available options:

1. **Self-hosted** on existing home network hardware (.12: 64GB/12 vCPU, .13: 96GB/18 vCPU) — both idle or underutilized
2. **Cloud (AWS/GCP)** — managed infrastructure with built-in external access

## Decision

Deploy to **self-hosted home network** hardware. Add external access later via Cloudflare Tunnel or Tailscale.

## Rationale

- **Cost**: $0/month vs ~$150-200/month for comparable cloud compute (t3.xlarge or larger for Coder workloads)
- **Hardware**: 160GB combined RAM and 30 vCPUs available — massively overprovisioned vs what cloud budget would buy
- **Coder support**: Native Docker/k8s on bare metal; cloud requires additional Docker socket configuration on VMs
- **Network latency**: Local access is sub-millisecond; sufficient for current single-team use
- External accessibility is additive — Cloudflare Tunnel or Tailscale can be layered on without changing the deployment architecture

## Consequences

- No built-in external access; requires additional work when remote access is needed
- Hardware maintenance is on us (power, networking, OS updates)
- No managed backups — must implement our own (see Phase 5 in deployment plan)
- Acceptable tradeoff: the hardware exists, is idle, and the cost savings fund other priorities
