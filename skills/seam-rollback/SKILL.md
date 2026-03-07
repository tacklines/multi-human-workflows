---
name: seam-rollback
description: "Emergency rollback for a bad Seam deployment on EC2. Checks the running container image, lists ECR candidates, pulls the target image, extracts static files, and restarts containers. Use immediately when a deployment is causing errors or service degradation. Keywords: seam, rollback, revert, deploy, docker, ec2, ecr, emergency, bad deploy, broken, restore."
argument-hint: "<target: 'previous' or sha-{commit}>"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
context: fork
---

# Seam-Rollback: Emergency Deployment Rollback

You are running **Seam-Rollback** — an emergency skill for reverting a bad Seam deployment to a known-good image. Speed matters: assess quickly, confirm the target, execute the rollback, verify the service is healthy. Target: **$ARGUMENTS**

## When to Use

- A deployment is causing 5xx errors, crashes, or service degradation
- Container logs show startup failures or repeated restarts after a recent push
- Static assets are broken after a deploy
- You need to revert to a specific prior commit SHA immediately

## Don't Use When

- The problem is infrastructure (EC2 instance itself, Caddy, networking) rather than the application image — use `/seam-infra` for that
- No prior images exist in ECR (first deploy) — there is nothing to roll back to
- The issue is a data/database problem — a rollback will not help and may cause schema mismatches

## Overview

```
Assess current state + list ECR candidates
  -> Confirm rollback target with user
    -> Pull image + extract static files + restart containers
      -> Verify health
        -> Report + tag + recommend next steps
```

---

## Phase 0: Assess

Determine the current state before making any changes.

### 0a. Parse Target

If `$ARGUMENTS` is empty, you will need to determine the target in 0d. Continue with assessment first.

If `$ARGUMENTS` is `previous`, you will select the most recent image before the currently running one.

If `$ARGUMENTS` matches `sha-<hex>`, that is the explicit rollback target.

### 0b. Check Running Image

Determine whether this is running locally on the EC2 instance or needs SSH. Check for SSH access:

```bash
# If running locally on the EC2 instance:
docker inspect seam-server --format '{{.Config.Image}}' 2>/dev/null || \
docker inspect seam-server-1 --format '{{.Config.Image}}' 2>/dev/null

# If not on EC2, SSH in:
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 \
  "docker inspect seam-server --format '{{.Config.Image}}' 2>/dev/null || \
   docker inspect seam-server-1 --format '{{.Config.Image}}' 2>/dev/null"
```

Record the currently running image tag. This is what you are rolling back FROM.

### 0c. Check Container Health and Logs

```bash
# Container status
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 \
  "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'"

# Recent logs for error signals
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 \
  "docker logs seam-server --tail=50 --since=10m 2>&1 | head -100"
```

Scan logs for: 5xx errors, exception stack traces, `Error:`, `FATAL`, `OOM`, `Exiting`, restart loops.

Summarize in one line: what is the failure mode?

### 0d. List ECR Candidates

Authenticate to ECR and list recent tagged images:

```bash
# Authenticate (run on EC2 or locally with AWS credentials)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# List last 5 sha-tagged images, sorted by push date descending
aws ecr describe-images \
  --repository-name seam/server \
  --region us-east-1 \
  --query 'sort_by(imageDetails[?starts_with(imageTags[0], `sha-`) == `true`], &imagePushedAt) | reverse(@) | [:5].{tag:imageTags[0], pushed:imagePushedAt}' \
  --output table
```

If AWS CLI is not available locally, run this via SSH on the EC2 instance (credentials are available via instance IAM role).

### 0e. Confirm Rollback Target

Display the assessment and ask the user to confirm:

```
## Rollback Assessment

**Currently running**: sha-{current} (or 'unknown')
**Failure mode**: <one-line summary from logs>

**ECR candidates** (most recent first):
1. sha-{a} — pushed {timestamp}  <-- PREVIOUS (default)
2. sha-{b} — pushed {timestamp}
3. sha-{c} — pushed {timestamp}
4. sha-{d} — pushed {timestamp}
5. sha-{e} — pushed {timestamp}

**Proposed rollback target**: sha-{a} (previous image)

Confirm target or specify a different SHA. Type 'go' to proceed with the proposed target, or 'sha-{x}' to choose a specific image.
```

**Do not proceed past this point without user confirmation.**

---

## Phase 1: Rollback

Execute the rollback on the EC2 instance.

### 1a. Resolve Target Tag

Set `TARGET_TAG` based on confirmed target:
- `previous` → the sha tag from candidate #1 in Phase 0
- `sha-{x}` → that literal tag

Set `ECR_REPO` to: `$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/seam/server`

### 1b. Pull Target Image

```bash
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 "
  # Authenticate to ECR via instance role (no credentials needed)
  aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin \
    \$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

  # Pull the target image
  docker pull \$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/seam/server:${TARGET_TAG}
"
```

### 1c. Extract Static Files

```bash
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 "
  ECR_IMAGE=\$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/seam/server:${TARGET_TAG}

  # Extract static files from the target image
  CONTAINER_ID=\$(docker create \$ECR_IMAGE)
  sudo rm -rf /opt/seam/static.rollback-backup
  sudo cp -r /opt/seam/static /opt/seam/static.rollback-backup
  sudo rm -rf /opt/seam/static
  docker cp \$CONTAINER_ID:/app/static /opt/seam/static 2>/dev/null || \
    docker cp \$CONTAINER_ID:/app/dist /opt/seam/static 2>/dev/null || \
    docker cp \$CONTAINER_ID:/app/public /opt/seam/static 2>/dev/null || \
    echo 'No static directory found in image — check image layout'
  docker rm \$CONTAINER_ID
"
```

If the static extraction fails with "No static directory found", ask the user for the correct path inside the image before continuing.

### 1d. Update SEAM_IMAGE and Restart

```bash
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 "
  ECR_IMAGE=\$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/seam/server:${TARGET_TAG}

  # Update SEAM_IMAGE in .env
  sudo sed -i \"s|^SEAM_IMAGE=.*|SEAM_IMAGE=\${ECR_IMAGE}|\" /opt/seam/.env

  # Verify the change
  grep SEAM_IMAGE /opt/seam/.env

  # Restart with target image
  cd /opt/seam && docker compose -f docker-compose.prod.yml up -d seam-server seam-worker
"
```

Wait 15 seconds for containers to start before proceeding to verification.

---

## Phase 2: Verify

Confirm the rolled-back service is healthy.

### 2a. Container Status

```bash
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 \
  "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'"
```

Both `seam-server` and `seam-worker` must be `Up`. If either shows `Exited` or `Restarting`, capture logs immediately and report to the user.

### 2b. Verify Running Image Tag

```bash
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 \
  "docker inspect seam-server --format '{{.Config.Image}}'"
```

Confirm the tag matches `$TARGET_TAG`. If it does not, the compose restart did not pick up the new env — diagnose before declaring success.

### 2c. Log Scan

```bash
ssh -i ~/.ssh/seam-ec2.pem ubuntu@35.174.204.185 \
  "docker logs seam-server --tail=30 --since=2m 2>&1"
```

Look for clean startup signals (listen port, "ready", "started"). Flag any errors.

### 2d. Endpoint Health Check

```bash
curl -sf https://seam.tacklines.com/ -o /dev/null -w "%{http_code}" && echo " OK" || echo " FAIL"
```

A 2xx or 3xx response confirms the service is reachable through Caddy. A 5xx or connection refused means the rollback did not resolve the issue.

### 2e. Verification Summary

```
## Verification

- seam-server: [Up | Exited]
- seam-worker: [Up | Exited]
- Running image: sha-{tag}  [matches target: yes | NO]
- Log scan: [clean | errors found]
- Endpoint check: [HTTP 200 OK | FAIL: HTTP NNN]

Result: [HEALTHY | DEGRADED | FAILED]
```

If DEGRADED or FAILED: do not declare success. Report what you found and ask the user how to proceed. Do not attempt a second rollback without confirmation.

---

## Phase 3: Report

### 3a. Tag the Rollback in Git

```bash
git tag rollback-$(date +%Y%m%d-%H%M%S) && git push origin --tags
```

This marks the rollback event in git history without affecting branches.

### 3b. Pipe-Format Rollback Report

```
## Rollback report

**Source**: /seam-rollback
**Input**: $ARGUMENTS
**Pipeline**: (none — working from direct input)

### Items (5)

1. **Rollback target** — sha-{target}
   - rolled back from: sha-{prior running}
   - image source: ECR seam/server

2. **Failure mode** — <what triggered the rollback>
   - log signals: <key error lines found in Phase 0>
   - containers affected: seam-server, seam-worker

3. **Rollback execution** — [success | partial | failed]
   - static files extracted: [yes | no | skipped]
   - .env updated: [yes | no]
   - containers restarted: [yes | no]

4. **Post-rollback health** — [HEALTHY | DEGRADED | FAILED]
   - endpoint: [HTTP 200 OK | HTTP NNN]
   - container status: [both Up | seam-server: X, seam-worker: Y]
   - git tag: rollback-{timestamp}

5. **Recommended next steps** — investigate root cause before next deploy
   - file a bug: title "deploy failure: <failure mode> on <date>"
   - check the deploy pipeline for the bad image: sha-{bad}
   - do not re-deploy until root cause is resolved

### Summary

Rolled back seam-server and seam-worker from sha-{bad} to sha-{target}. The failure mode was <description>. Post-rollback health check <passed/failed>. A git tag rollback-{timestamp} marks this event. Root cause investigation should precede the next deploy attempt.
```

### 3c. Recommend Next Steps

Always close with:

1. **File a bug** for the root cause investigation — use `/seam-triage` or create a task manually
2. **Do not re-deploy** until the bad image's failure is understood
3. **Check the static backup** at `/opt/seam/static.rollback-backup` — remove once confirmed healthy
4. If the rollback itself failed: escalate to `/seam-infra` for direct instance access

---

## Guidelines

1. **Confirm before executing.** Always show the candidate list and proposed target and wait for user confirmation. One wrong SHA selection wastes time and makes things worse.
2. **Speed over ceremony.** Skip explanatory prose inside phases. Run the commands.
3. **SSH pattern is the default.** Assume the skill runs on a local machine and SSHs to EC2. If you detect you are already on the EC2 instance (check `hostname` or the presence of `/opt/seam`), run commands directly without SSH.
4. **Static backup always.** Preserve the old static directory as `.rollback-backup` before extracting. This allows a manual undo if extraction goes wrong.
5. **Both containers must be healthy.** A rollback is not complete until both `seam-server` and `seam-worker` are `Up` and the endpoint responds.
6. **Never skip verification.** A successful `docker compose up` does not mean the containers stayed up. Always check container status and endpoint health before declaring done.
7. **Compaction resilience.** Write rollback state to `memory/scratch/seam-rollback-checkpoint.md` after Phase 1 so that if context compacts during verification, you can still report what was executed.

## See Also

- `/seam-deploy` — Forward deployment (normal flow)
- `/seam-infra` — Infrastructure-level issues (instance, Caddy, networking)
- `/seam-triage` — Investigate the root cause after the service is stable
