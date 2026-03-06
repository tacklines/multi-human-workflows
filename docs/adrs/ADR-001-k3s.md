# ADR-001: EKS for Container Orchestration

**Status**: Accepted (supersedes previous k3s decision)
**Date**: 2026-03-06
**Deciders**: ty

## Context

Seam runs multiple services (Rust API, PostgreSQL, OIDC provider, RabbitMQ) and spawns untrusted agent workspaces via Coder. The deployment strategy must:

- Isolate untrusted agent compute from platform services
- Enforce resource limits to prevent cost runaway
- Support FQDN-based egress policies for workspace pods
- Provide managed control plane to minimize operational burden

## Decision

Use **Amazon EKS** as the container orchestrator.

## Rationale

- **Managed control plane**: No etcd management, automatic k8s version upgrades, built-in HA
- **VPC-native networking**: Pod-level security groups and subnet isolation between platform and workspace node groups
- **Managed node groups**: Autoscaling, automatic AMI updates, spot instance support for workspace nodes
- **IAM integration**: IRSA (IAM Roles for Service Accounts) for fine-grained AWS service access without static credentials
- **AWS ecosystem**: Native integration with ALB, ACM, Secrets Manager, RDS, CloudWatch — reduces glue code and operational surface

## Consequences

- AWS cost is ongoing (~$73/mo for control plane + node compute + data transfer)
- Vendor lock-in for orchestration layer (mitigated: workloads are standard k8s manifests, portable to any managed k8s)
- Team must learn EKS-specific concepts (IRSA, managed node groups, aws-load-balancer-controller)
- Cluster provisioning via Terraform/OpenTofu for reproducibility
