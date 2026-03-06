# ADR-001: k3s for Container Orchestration

**Status**: Accepted
**Date**: 2026-03-05
**Deciders**: ty

## Context

Seam runs multiple services (Rust API, PostgreSQL, OIDC provider) and spawns untrusted agent workspaces via Coder. The deployment strategy must isolate untrusted compute from platform services while remaining operationally simple for a small team.

Three options were evaluated:

1. **Docker Compose** — Current dev setup. Single daemon, no resource boundaries. Coder workspaces share a Docker daemon with Postgres.
2. **k3s** — Lightweight Kubernetes. Single binary, embedded etcd, built-in Traefik ingress, CoreDNS. Designed for 2-3 node clusters.
3. **Full Kubernetes (kubeadm/managed)** — Full control plane with separate etcd, multiple API servers. Designed for large-scale production.

## Decision

Use **k3s** as the container orchestrator.

## Rationale

- **Namespace isolation** separates `seam-core` (platform) from `seam-coder` (untrusted workspaces) with enforced NetworkPolicies
- **Resource limits** at pod and namespace level prevent workspace runaway from starving the database
- **Rolling updates** allow upgrading individual services without full-stack downtime
- **Single binary** with minimal operational overhead — proportional to our 2-node cluster scale
- Docker Compose lacks resource isolation entirely; full k8s adds operational burden (etcd management, HA control plane) that a 2-node cluster doesn't need

## Consequences

- k3s uses containerd, not Docker — coexists with existing Docker containers on .12
- Coder template must target the Kubernetes provisioner (pods) instead of Docker containers
- Team must learn basic kubectl/k8s concepts
- Upgrade path to full k8s exists if scale demands it (k3s is CNCF-conformant)
