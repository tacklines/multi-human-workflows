---
name: seam-infra
description: "Manage Seam's AWS infrastructure via Terraform. Supports plan/apply/status/secret/ssh modes. Use when you need to inspect infrastructure state, plan or apply Terraform changes, update SSM secrets, or retrieve SSH access details. NEVER auto-applies -- always requires explicit user confirmation before any changes. Keywords: seam, terraform, infra, infrastructure, aws, ec2, ecr, ssm, secret, plan, apply, status, ssh."
argument-hint: "<mode: plan|apply|status|secret|ssh> [name] [value]"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
context: fork
---

# Seam-Infra: Terraform Infrastructure Management

You are running **Seam-Infra** — the infrastructure management skill for Seam's AWS environment. All Terraform operations run from `infra/deploy/`. Mode: **$ARGUMENTS**

## When to Use

- Before deploying: check infrastructure state and drift (`status`)
- When making infrastructure changes: review impact before touching anything (`plan`)
- After a reviewed plan: apply approved changes (`apply`)
- When rotating or adding secrets: update SSM Parameter Store (`secret`)
- When you need server access details or admin commands (`ssh`)

## Don't Use When

- You need to provision the initial S3 backend — that's `infra/deploy/bootstrap.sh` (run manually)
- You are migrating to EKS (ADR-001) — infrastructure will change significantly; wait for new skill
- You are not in the Seam project root

## Overview

```
Parse mode from $ARGUMENTS
  -> plan:   init -> terraform plan -> summarize changes -> gate (no auto-apply)
  -> apply:  load/generate plan -> show summary -> HARD GATE -> terraform apply -> verify outputs
  -> status: terraform show -> check drift -> report resource inventory + outputs
  -> secret: update SSM parameter -> verify -> list current secret names
  -> ssh:    show terraform ssh output -> list common admin commands
```

---

## Phase 0: Parse and Gate

### 0a. Parse Mode and Arguments

Extract the mode from `$ARGUMENTS`. Expected formats:

| Input | Mode | Extra args |
|-------|------|------------|
| `plan` | plan | — |
| `apply` | apply | — |
| `status` | status | — |
| `secret <name> <value>` | secret | name, value |
| `secret <name>` | secret | name only (will prompt for value) |
| `ssh` | ssh | — |
| *(empty)* | status | — (default: show current state) |

If mode is unrecognized, report the valid modes and stop.

### 0b. Check Working Directory

Confirm `infra/deploy/` exists:

```bash
ls infra/deploy/main.tf 2>/dev/null || echo "NOT FOUND"
```

If not found, check if you're in a subdirectory and need to navigate up. If `infra/deploy/` genuinely does not exist, stop with an error.

### 0c. Check for State Lock (plan and apply modes only)

Before running any Terraform command:

```bash
aws dynamodb get-item \
  --table-name seam-terraform-locks \
  --key '{"LockID": {"S": "seam-terraform-state/terraform.tfstate"}}' \
  --region us-east-1 \
  --output json 2>/dev/null
```

If a lock exists, report:
> "WARNING: Terraform state is locked. Another operation may be in progress. Lock info: [ID, who, when]. Proceed with caution or wait for the lock to clear."

Do not stop on a lock warning — report it and continue (the user may need to run `terraform force-unlock` if the lock is stale).

---

## Mode: plan

### P1. Initialize

```bash
cd infra/deploy && terraform init -input=false 2>&1 | tail -20
```

If init fails (e.g., backend unreachable, credentials issue), report the error and stop. Do not proceed to plan.

Check if init was already done (`.terraform/` directory exists):

```bash
ls infra/deploy/.terraform/ 2>/dev/null && echo "already initialized"
```

If already initialized and init succeeds quickly (no provider downloads needed), note that.

### P2. Generate Plan

```bash
cd infra/deploy && terraform plan -out=tfplan -input=false 2>&1
```

Capture the full output. If plan fails, show the error and stop.

### P3. Parse and Summarize Changes

From the plan output, extract:

- Total changes: `N to add, N to change, N to destroy`
- Resources being **added** (list each)
- Resources being **changed** (list each, note what attributes change if shown)
- Resources being **destroyed** (list each — highlight prominently)
- Resources being **replaced** (destroy + create — highlight prominently, this causes downtime)

Report in this format:

```
## Terraform Plan Summary

### Change counts
- Add: N
- Change: N
- Destroy: N (REVIEW CAREFULLY)
- Replace: N (CAUSES DOWNTIME)

### Resources to add
- `aws_...resource.name` — <what it is>

### Resources to change
- `aws_...resource.name` — <attribute(s) changing>

### Resources to destroy
WARNING: The following resources will be permanently destroyed:
- `aws_...resource.name` — <what this is and why destruction matters>

### Resources to replace (destroy + recreate)
WARNING: The following resources will be destroyed and recreated (downtime risk):
- `aws_...resource.name` — <expected impact: e.g., "EC2 instance — server downtime during replacement">
```

### P4. Confirmation Gate

**Do not apply automatically under any circumstances.**

After showing the summary, always end with:

> "Plan written to `infra/deploy/tfplan`. Review the changes above. To apply, run `/seam-infra apply`."

If the plan shows no changes:
> "Infrastructure is up to date. No changes to apply."
> Delete the empty plan file: `rm -f infra/deploy/tfplan`

If there are destructive changes, add:
> "WARNING: This plan includes destructive changes (destroys or replaces). Verify the impact before applying."

---

## Mode: apply

### A1. Load or Generate Plan

Check for an existing plan file:

```bash
ls -la infra/deploy/tfplan 2>/dev/null
```

If a plan file exists, show its age:

```bash
stat -c "%y" infra/deploy/tfplan 2>/dev/null || stat -f "%Sm" infra/deploy/tfplan 2>/dev/null
```

If the plan is more than 30 minutes old, warn:
> "The plan file is N minutes old. Infrastructure may have changed since it was generated. Recommend running `/seam-infra plan` again before applying."

If no plan file exists, run the plan phase (P1-P3 above) first to generate one.

### A2. Show Plan Summary

Show the same change summary as the plan mode output. The user must see what will be applied before confirming.

### A3. Hard Confirmation Gate

**This is a mandatory hard gate. Never skip it.**

Display:

```
## Apply Confirmation Required

The plan above will make N changes to live AWS infrastructure.

Destructive changes: [yes: N destroys/replaces | no]

Type APPLY (all caps) to proceed, or anything else to cancel.
```

Wait for user input. If the user does not type exactly `APPLY`:
> "Apply cancelled. The plan file has been preserved at `infra/deploy/tfplan`."
> Stop.

If the user types `APPLY`, proceed.

### A4. Apply

```bash
cd infra/deploy && terraform apply -input=false tfplan 2>&1
```

Stream output as it runs. If apply fails partway through, report the error and the partial state:
> "Apply failed. Terraform state may be partially updated. Check `terraform show` and address the error before retrying."

### A5. Report Outputs

After successful apply:

```bash
cd infra/deploy && terraform output -json 2>&1
```

Format key outputs:

```
## Apply Complete

### Infrastructure Outputs

| Output | Value |
|--------|-------|
| Public IP | <elastic_ip_address> |
| ECR URL | <ecr_repository_url> |
| SSH command | `ssh <user>@<ip>` |
| GitHub Actions role ARN | <github_actions_role_arn> |
| EC2 instance role ARN | <ec2_instance_role_arn> |
| Backup bucket | <s3_backup_bucket_name> |
```

### A6. Cleanup

Remove the consumed plan file:

```bash
rm -f infra/deploy/tfplan
```

Note: "Plan file removed. Future applies will require a fresh plan."

---

## Mode: status

### S1. Current State Summary

```bash
cd infra/deploy && terraform show -json 2>&1 | head -1000
```

If the state is empty or the backend is unreachable, report the error and stop.

From the state JSON, extract and report the resource inventory:

```
## Infrastructure Status

### Resource Inventory

| Resource | Name/ID | Status |
|----------|---------|--------|
| EC2 Instance | i-xxxx (t4g.large, AL2023) | running |
| Elastic IP | x.x.x.x | associated |
| ECR Repository | seam/server | active |
| S3 Backup Bucket | seam-backups-xxx | active |
| SSM Parameters | 7 SecureString params | active |
| Security Groups | seam-sg | active |
| IAM Role (GHA) | seam-github-actions | active |
| IAM Role (EC2) | seam-ec2-role | active |
```

### S2. Current Outputs

```bash
cd infra/deploy && terraform output 2>&1
```

Show all outputs (these do not include secret values).

### S3. Drift Check

Run a plan in check mode to detect drift:

```bash
cd infra/deploy && terraform plan -detailed-exitcode -input=false 2>&1
```

Exit codes: `0` = no changes, `1` = error, `2` = changes detected.

Report:
- Exit 0: "No drift detected. Infrastructure matches Terraform state."
- Exit 2: "Drift detected. Run `/seam-infra plan` to see what changed."
- Exit 1: Show the error.

### S4. Status Report (pipe format)

```
## Infrastructure status

**Source**: /seam-infra
**Input**: status
**Pipeline**: (none — working from direct input)

### Items (N)

1. **EC2 Instance** — t4g.large ARM64, AL2023, us-east-1
   - id: i-xxxx
   - state: running | stopped | terminated

2. **Elastic IP** — public IPv4 address
   - ip: x.x.x.x
   - association: attached to i-xxxx

3. **ECR Repository** — seam/server
   - url: <account>.dkr.ecr.us-east-1.amazonaws.com/seam/server
   - scanning: enabled

4. **S3 Backup Bucket** — daily pg_dump + Caddy cert backups
   - versioning: enabled
   - encryption: AES256

5. **SSM Parameters** — 7 SecureString secrets
   - names: listed in /seam-infra secret (values never shown)

6. **Drift** — infrastructure vs Terraform state
   - result: [no drift | drift detected — run /seam-infra plan]

### Summary

[One paragraph: current infrastructure health, any notable state, drift status, and whether anything needs attention.]
```

---

## Mode: secret

### Sc1. Parse Arguments

From `$ARGUMENTS` (format: `secret <name> <value>`):

- Extract `name` — the SSM parameter name or short name
- Extract `value` — the secret value

If only a name is provided (no value), ask:
> "What value should be set for parameter `<name>`?"

**Never display or log the value in output.** Treat the value as write-only from this point.

If no name is provided, skip to Sc4 (list current secrets).

### Sc2. Resolve Parameter Path

SSM parameters for Seam follow the convention `/seam/<name>`. If the user provides a short name (without leading `/`), prepend the path:

- `database-url` -> `/seam/database-url`
- `/seam/database-url` -> `/seam/database-url` (already qualified)

### Sc3. Update the Parameter

```bash
aws ssm put-parameter \
  --name "/seam/<name>" \
  --value "<value>" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

Do not log the command with the value substituted — use a redacted form in output:
> "Running: `aws ssm put-parameter --name /seam/<name> --value [REDACTED] --type SecureString --overwrite`"

Capture the response. On success, the response will include a `Version` number.

### Sc4. Verify the Update

```bash
aws ssm get-parameter \
  --name "/seam/<name>" \
  --with-decryption \
  --region us-east-1 \
  --query "Parameter.{Name:Name,Version:Version,LastModifiedDate:LastModifiedDate,Type:Type}" \
  --output table 2>&1
```

Report the metadata (Name, Version, LastModifiedDate, Type) — **not the value**.

### Sc5. List Current Secret Names

Always list the current SSM parameter names (not values) for reference:

```bash
aws ssm describe-parameters \
  --filters "Key=Name,Values=/seam/" \
  --region us-east-1 \
  --query "Parameters[].{Name:Name,Version:Version,LastModified:LastModifiedDate}" \
  --output table 2>&1
```

Report:

```
## SSM Parameter Store: /seam/*

| Name | Version | Last Modified |
|------|---------|---------------|
| /seam/database-url | 3 | 2025-01-15 |
| /seam/... | N | date |

Values are not shown. To update a parameter: /seam-infra secret <name> <value>
```

---

## Mode: ssh

### Sh1. Get SSH Command from Outputs

```bash
cd infra/deploy && terraform output -raw ssh_command 2>/dev/null || \
  terraform output 2>/dev/null | grep -i ssh
```

If the output has an `ssh_command` output, show it directly. Otherwise construct it from `elastic_ip_address`:

```bash
cd infra/deploy && terraform output -raw elastic_ip_address 2>/dev/null
```

Display:

```
## SSH Access

### Connection
ssh ec2-user@<ip>

### Prerequisites
- SSH key configured (check infra/deploy/variables.tf for key_name)
- Tailscale connected (for private network access if using Tailscale IP)
- Port 22 open in security group (seam-sg)
```

### Sh2. Common Admin Commands

Provide ready-to-run commands for common admin tasks on the server:

```
## Common Admin Commands (run via SSH)

### Container status
docker ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

### Application logs
docker logs seam-server --tail=100 --follow
docker logs caddy --tail=50

### Restart application
sudo systemctl restart seam-server
docker compose -f /opt/seam/docker-compose.yml restart

### ECR login (if pulling new image manually)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ecr-url>

### Backup status (pg_dump timer)
systemctl status seam-backup.timer
journalctl -u seam-backup.service --since="24 hours ago"

### Caddy cert backup status
ls -lh /opt/seam/caddy-data/
systemctl status caddy

### Disk usage
df -h
docker system df

### SSM parameter refresh (if app reads from SSM at startup)
sudo systemctl restart seam-server
```

---

## Guidelines

1. **Never auto-apply.** The apply mode has a mandatory HARD GATE requiring the user to type `APPLY`. This cannot be skipped, automated, or inferred from context.

2. **Never display secret values.** SSM parameter values are write-only. The secret mode writes but never reads back values. Metadata (name, version, last-modified) is safe to show.

3. **Highlight destructive changes prominently.** Any plan containing destroys or replaces gets a prominent WARNING block. Force the user to see the impact before they can apply.

4. **State lock awareness.** Always check for Terraform state locks before plan or apply. Report the lock details if one exists — don't silently fail or override.

5. **Fork context is intentional.** Terraform output is verbose. Running in a forked context keeps the main session clean. All output stays in this fork.

6. **Plan file lifecycle.** The plan file (`tfplan`) is created by `plan` mode and consumed (then deleted) by `apply` mode. If apply is cancelled, the plan is preserved. If the plan is stale (>30 min), warn and recommend re-planning.

7. **AWS credentials are assumed.** This skill assumes AWS credentials are configured in the environment (instance profile, `~/.aws/credentials`, or env vars). If AWS commands fail with auth errors, report the error and suggest checking credentials — do not attempt to configure credentials.

8. **Adapt output names to actual Terraform outputs.** The output names in this skill (e.g., `elastic_ip_address`, `ssh_command`) are based on expected naming in `infra/deploy/outputs.tf`. If actual output names differ, use the actual names from `terraform output`.

## See Also

- `/seam-deploy` — Build and push Docker image, then deploy the application to EC2
- `infra/deploy/bootstrap.sh` — One-time S3 backend + DynamoDB lock table setup (not managed by this skill)
- `infra/deploy/user-data.sh` — EC2 bootstrap script (Docker, Caddy, Tailscale, ECR, systemd)
