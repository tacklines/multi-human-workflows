# ADR-002: Managed Services for Stateful Infrastructure

**Status**: Accepted (supersedes previous self-hosted decision)
**Date**: 2026-03-06
**Deciders**: ty

## Context

Seam depends on PostgreSQL, an OIDC provider, and RabbitMQ. Each can be self-managed in k8s (StatefulSets) or offloaded to managed services. The tradeoff is cost vs operational burden.

Agent workspaces are the primary cost driver — stateful infrastructure should be reliable and low-maintenance so operational attention stays on the security-critical workspace layer.

## Decision

Use **managed services** where the operational savings justify the cost:

| Component | Approach | Service |
|-----------|----------|---------|
| PostgreSQL | Managed | RDS (or Aurora Serverless v2) |
| OIDC | Self-managed in k8s | See [ADR-003](ADR-003-oidc-provider.md) |
| RabbitMQ | Self-managed in k8s | Bitnami Helm chart |
| Coder | Self-managed in k8s | Coder Helm chart |

## Rationale

- **RDS for Postgres**: Automated backups, point-in-time recovery, encryption at rest, minor version upgrades. Running Postgres in k8s is possible but backup/restore and HA add significant operational complexity.
- **OIDC in k8s**: Lightweight enough to self-manage (see ADR-003). No managed OIDC service fits our requirements without vendor lock-in.
- **RabbitMQ in k8s**: Amazon MQ exists but adds cost for a component that's simple to run via Helm chart. Acceptable to self-manage at current scale.
- **Coder in k8s**: Must run in-cluster to use the Kubernetes provisioner for workspace pods.

## Consequences

- RDS cost (~$15-50/mo for db.t4g.small) added to infrastructure bill
- RDS handles backups, but we must configure retention and test restores
- RabbitMQ and Coder require monitoring and upgrade attention
- If RabbitMQ operational burden grows, migration to Amazon MQ is straightforward
