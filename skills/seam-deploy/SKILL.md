---
name: seam-deploy
description: "Deploy the Seam Rust/Axum + Lit/TypeScript web app to AWS production. Runs pre-flight checks (git state, cargo check, cargo test, AWS credentials), builds and pushes a Docker image to ECR, deploys via GitHub Actions (push to main) or manual SSH, then verifies running containers and Caddy proxy health. Use when you are ready to ship to seam.tacklines.com. Keywords: seam, deploy, aws, ecr, docker, production, release, ship."
argument-hint: "<'ci' | 'manual' | 'status' | 'rollback'>"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
context: fork
---

# Seam-Deploy: Production Deployment for Seam on AWS

You are running **Seam-Deploy** — a structured deployment workflow for the Seam web app (Rust/Axum API + Lit/TypeScript frontend) hosted on AWS EC2 (us-east-1, Elastic IP 35.174.204.185). Mode: **$ARGUMENTS**

## When to Use

- You are ready to ship changes to seam.tacklines.com and want a safe, gated workflow
- You want to verify production is healthy without deploying (`status`)
- You need to roll back a bad deploy (`rollback`)
- You want to run pre-flight checks before deciding whether to deploy

## Don't Use When

- Changes are not committed and pushed to `main` — Phase 0 will catch this, but don't invoke as a shortcut around a broken build
- You need to provision or change infrastructure — use Terraform in `infra/deploy/` directly
- You only want to run tests — use `just test-all` directly

## Mode Selection

Parse `$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| `ci` or empty | GitHub Actions path: confirm push to main, monitor GH Actions workflow |
| `manual` | Manual path: SSH to EC2, pull image, restart compose |
| `status` | Skip deploy — check prod health only (Phase 3) |
| `rollback` | Skip to rollback guidance (Phase 4) |

If `$ARGUMENTS` is empty, default to `ci` mode and ask for confirmation before pushing.

## Overview

```
Pre-flight gate (git, cargo check, cargo test, AWS creds)
  -> Build and push Docker image to ECR (or trigger CI)
    -> Deploy via GH Actions (ci) or SSH (manual)
      -> Verify: containers, Caddy proxy, logs, DB connectivity
        -> Tag deployment + post summary
          -> (if failure) Rollback guidance
```

---

## Phase 0: Pre-flight Checks

**This phase is a hard gate. If any check fails, stop and report what must be fixed before deploying.**

Write checkpoint at start: `memory/scratch/seam-deploy-checkpoint.md`

```markdown
# Seam-Deploy Checkpoint

**Started**: <date>
**Mode**: <ci | manual>

## Phase 0: Pre-flight
Status: IN PROGRESS
```

### 0a. Branch and Working Tree

```bash
git -C /home/ty/workspace/tacklines/seam branch --show-current
git -C /home/ty/workspace/tacklines/seam status --short
```

- Must be on `main`. Any other branch: FAIL. Ask the user to merge or switch.
- Working tree must be clean. Uncommitted changes: FAIL. List dirty files.
- Confirm the local `main` is up to date with remote:

```bash
git -C /home/ty/workspace/tacklines/seam fetch origin main --dry-run 2>&1
git -C /home/ty/workspace/tacklines/seam log --oneline origin/main..HEAD
```

If local HEAD is ahead of remote, the push in Phase 2 will include those commits. Confirm with user.

### 0b. Cargo Check

```bash
cd /home/ty/workspace/tacklines/seam && cargo check --workspace 2>&1 | tail -20
```

Any compile error: FAIL. Do not proceed.

### 0c. Cargo Test

```bash
cd /home/ty/workspace/tacklines/seam && cargo test --workspace 2>&1 | tail -30
```

Any test failure: FAIL. Report the failing tests. Do not proceed.

### 0d. AWS Credentials

```bash
aws sts get-caller-identity 2>&1
```

If this fails: FAIL. The user must configure AWS credentials (e.g., `aws configure` or set environment variables `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).

Verify the caller identity is for the expected AWS account.

### 0e. ECR Login Check

```bash
aws ecr describe-repositories --repository-names seam/server --region us-east-1 2>&1
```

Confirms AWS credentials can reach ECR. If this fails, verify the IAM role has `ecr:DescribeRepositories`.

### 0f. Commit Range Summary

Show what will be deployed:

```bash
# Find the most recent deploy tag
git -C /home/ty/workspace/tacklines/seam tag --sort=-version:refname | grep '^deploy-' | head -1
# Show commits since that tag (or last 10 if no tag found)
git -C /home/ty/workspace/tacklines/seam log --oneline <last-deploy-tag>..HEAD 2>/dev/null || git -C /home/ty/workspace/tacklines/seam log --oneline -10
```

List changed files:

```bash
git -C /home/ty/workspace/tacklines/seam diff --name-only <last-deploy-tag>..HEAD 2>/dev/null || git -C /home/ty/workspace/tacklines/seam diff --name-only HEAD~5..HEAD
```

Report:

```
## Commit Range: [last-deploy-tag]..HEAD

Commits: N
Key changes:
- server/src/...: <description>
- frontend/src/...: <description>
```

### 0g. Gate Summary

```
## Pre-flight Gate: [PASS | FAIL]

- Branch: [main, clean | FAIL: <reason>]
- Cargo check: [pass | FAIL: compile errors]
- Cargo test: [pass | FAIL: N failures]
- AWS credentials: [verified | FAIL: not configured]
- ECR access: [verified | FAIL: permission denied]
- Deploy scope: N commits since <last-tag>

[If FAIL]: Fix the above before deploying. Re-run /seam-deploy when ready.
[If PASS]: Proceeding to deploy (mode: <ci | manual>).
```

Update checkpoint to reflect Phase 0 outcome.

---

## Phase 1: Build and Push

**Confirm with the user before executing this phase.** Show the gate summary and ask:

> "Pre-flight checks passed. Ready to build and deploy N commits (mode: <ci|manual>). Proceed? (yes/no)"

Wait for explicit confirmation. Do not proceed on ambiguous input.

### Path A: CI Mode (Recommended)

In CI mode, GitHub Actions handles the build and deploy when `main` is pushed. Skip manual Docker steps.

**Verify the deploy workflow exists:**

```bash
cat /home/ty/workspace/tacklines/seam/.github/workflows/deploy.yml | head -20
```

**Check for pending workflow runs:**

```bash
gh run list --repo tyevans/seam --workflow deploy.yml --limit 3 2>&1
```

If a workflow run is already in progress, report it and ask whether to wait or push another commit.

**Trigger the deploy** by pushing to main (only if the user confirmed in Phase 0):

```bash
git -C /home/ty/workspace/tacklines/seam push origin main
```

Get the run ID and monitor:

```bash
gh run list --repo tyevans/seam --workflow deploy.yml --limit 1 2>&1
# Then watch the specific run
gh run watch <run-id> --repo tyevans/seam 2>&1
```

If the workflow completes successfully, proceed to Phase 2 verification.
If the workflow fails, show the failure log:

```bash
gh run view <run-id> --log-failed --repo tyevans/seam 2>&1
```

Then proceed to Phase 4 (rollback guidance).

### Path B: Manual Mode

In manual mode, build locally and deploy via SSH. Use this when GH Actions is unavailable or you need to test a specific local change.

**Note:** EC2 cannot push to ECR; it can only pull. The build must happen locally or in CI.

**Get ECR registry URL:**

```bash
aws ecr describe-repositories --repository-names seam/server --region us-east-1 --query 'repositories[0].repositoryUri' --output text
```

**Get Vite auth config from SSM:**

```bash
aws ssm get-parameter --name /seam/VITE_AUTH_AUTHORITY --with-decryption --query 'Parameter.Value' --output text --region us-east-1 2>&1
```

**Build the Docker image:**

```bash
cd /home/ty/workspace/tacklines/seam && \
COMMIT_SHA=$(git rev-parse --short HEAD) && \
ECR_REPO=<ecr-registry-url> && \
docker build \
  --build-arg VITE_AUTH_AUTHORITY=$(aws ssm get-parameter --name /seam/VITE_AUTH_AUTHORITY --with-decryption --query 'Parameter.Value' --output text --region us-east-1) \
  -f server/Dockerfile \
  -t seam-server:latest \
  -t seam-server:sha-${COMMIT_SHA} \
  -t ${ECR_REPO}:latest \
  -t ${ECR_REPO}:sha-${COMMIT_SHA} \
  . 2>&1 | tail -20
```

This is a multi-stage build (Node 22 frontend → Rust builder → Debian slim runtime) and will take several minutes on first run.

**Login to ECR and push:**

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ecr-registry-url>
docker push <ecr-registry-url>:latest
docker push <ecr-registry-url>:sha-${COMMIT_SHA}
```

**Verify image is in ECR:**

```bash
aws ecr describe-images --repository-name seam/server --region us-east-1 \
  --image-ids imageTag=sha-${COMMIT_SHA} --query 'imageDetails[0].{pushed:imagePushedAt,size:imageSizeInBytes}' 2>&1
```

Update checkpoint with Phase 1 outcome.

---

## Phase 2: Deploy to EC2

### Path A: CI Mode

CI mode deploys automatically after the workflow completes. The SSM-based deploy step in `deploy.yml` handles:

1. SSH to EC2 via SSM session manager
2. Pull new image from ECR
3. Extract static files
4. Restart via `docker-compose up -d`

No manual steps needed. Proceed to Phase 3 verification. Wait 60 seconds for containers to stabilize before checking health.

### Path B: Manual Deploy via SSH

**SSH to the EC2 instance:**

```bash
ssh ec2-user@35.174.204.185
```

Once connected, run the deploy sequence on EC2:

```bash
# Pull new image from ECR (EC2 has read access to ECR via instance profile)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ecr-registry-url>
docker pull <ecr-registry-url>:latest

# Extract static files from image
docker run --rm -v /opt/seam/static:/static <ecr-registry-url>:latest cp -r /app/static/. /static/

# Restart services
cd /opt/seam && sudo docker-compose -f docker-compose.prod.yml up -d --no-deps seam-server seam-worker
```

Wait for containers to be healthy:

```bash
docker ps --filter name=seam --format "table {{.Names}}\t{{.Status}}"
```

Update checkpoint with Phase 2 outcome.

---

## Phase 3: Verify

Wait 60 seconds after deploy before running verification checks. This allows containers to start and the health check grace period to elapse.

### 3a. Container Status

Check that seam-server and seam-worker are running on EC2:

```bash
ssh ec2-user@35.174.204.185 'docker ps --filter name=seam --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
```

Expected: both `seam-server` and `seam-worker` show `Up` status.

If either shows `Restarting` or `Exited`, the deploy likely failed. Jump to Phase 4.

### 3b. Caddy Proxy Health

Verify Caddy is proxying to the app correctly:

```bash
# Check the homepage loads
curl -sf -o /dev/null -w "%{http_code}" https://seam.tacklines.com/ 2>&1

# Check that the API prefix is reachable (returns any 2xx or 4xx, not 5xx or connection refused)
curl -sf -o /dev/null -w "%{http_code}" https://seam.tacklines.com/api/ 2>&1
```

Note: The `/api/health` endpoint does not yet exist. Use `/api/` and accept 404 as a pass (it means the server is up and routing).

### 3c. Container Logs (First 60 Seconds)

Scan for startup errors:

```bash
ssh ec2-user@35.174.204.185 'docker logs seam-server --since 2m 2>&1 | tail -40'
ssh ec2-user@35.174.204.185 'docker logs seam-worker --since 2m 2>&1 | tail -20'
```

Look for:
- Database connection errors (`connection refused`, `password authentication failed`)
- Migration failures (`migration failed`, `sqlx::migrate`)
- Panics or crashes (`RUST_BACKTRACE`, `thread main panicked`)
- Port binding failures (`address already in use`)

### 3d. Database Connectivity

Confirm the server established a DB connection pool:

```bash
ssh ec2-user@35.174.204.185 'docker logs seam-server --since 2m 2>&1 | grep -i -E "(pool|postgres|migration|database)" | tail -10'
```

Look for messages like `database pool initialized` or `migrations complete`. Absence of error messages is also acceptable.

### 3e. Verification Summary

```
## Verification: [HEALTHY | DEGRADED | FAILED]

- seam-server: [Up N minutes | FAIL: status]
- seam-worker: [Up N minutes | FAIL: status]
- Caddy proxy: [pass (HTTP NNN) | FAIL (HTTP NNN or connection refused)]
- Startup logs: [clean | WARNING: N errors | FAIL: error pattern]
- DB connectivity: [confirmed | unconfirmed (no errors) | FAIL: error]

[If HEALTHY]: Deploy successful. Proceeding to post-deploy tagging.
[If DEGRADED or FAILED]: Rollback criteria triggered — see Phase 4.
```

Update checkpoint with Phase 3 outcome.

---

## Phase 4: Post-Deploy or Rollback

### Path A: Successful Deploy

Tag the deployment in git:

```bash
DEPLOY_TAG="deploy-$(date +%Y%m%d-%H%M%S)"
git -C /home/ty/workspace/tacklines/seam tag ${DEPLOY_TAG} HEAD
git -C /home/ty/workspace/tacklines/seam push origin ${DEPLOY_TAG}
echo "Tagged: ${DEPLOY_TAG}"
```

Clean up checkpoint:

```bash
rm -f memory/scratch/seam-deploy-checkpoint.md
```

Emit the deployment report in pipe format:

```
## Deployment outcomes

**Source**: /seam-deploy
**Input**: seam to production (seam.tacklines.com)
**Pipeline**: (none — working from direct input)

### Items (5)

1. **Deploy mode** — <ci | manual>
   - trigger: <git push to main | manual SSH>
   - workflow: <GH Actions run ID | manual compose up>

2. **Version deployed** — sha-<commit>
   - branch: main
   - commit: <short SHA>
   - deploy tag: <deploy-YYYYMMDD-HHMMSS>

3. **Pre-flight gate** — PASS
   - cargo check: pass
   - cargo test: pass
   - AWS credentials: verified
   - commits deployed: N since <last-deploy-tag>

4. **Health verification** — HEALTHY
   - seam-server: Up
   - seam-worker: Up
   - Caddy proxy: HTTP <NNN>
   - DB connectivity: confirmed

5. **Rollback status** — not triggered
   - previous stable tag: <last-deploy-tag>
   - rollback command: see below if needed

### Summary

Deployed commit sha-<SHA> to seam.tacklines.com using <mode> mode. All pre-flight checks passed. seam-server and seam-worker containers are running, Caddy is proxying correctly, and no startup errors were detected. Deploy tagged as <deploy-tag>.
```

### Path B: Rollback

**If Phase 3 shows FAILED and automatic rollback is appropriate (crash loop, 5xx on homepage):**

Report the failure clearly, then present rollback options. **Do not execute rollback without user confirmation.**

> "Deploy verification failed: [reason]. Recommend rolling back to [previous-tag]. Confirm rollback? (yes/no)"

**Rollback execution (manual on EC2):**

```bash
# On EC2: pull the previous image by tag
PREV_SHA=<previous-commit-sha>
ssh ec2-user@35.174.204.185 "
  docker pull <ecr-registry-url>:sha-${PREV_SHA} && \
  docker tag <ecr-registry-url>:sha-${PREV_SHA} <ecr-registry-url>:latest && \
  docker run --rm -v /opt/seam/static:/static <ecr-registry-url>:sha-${PREV_SHA} cp -r /app/static/. /static/ && \
  cd /opt/seam && sudo docker-compose -f docker-compose.prod.yml up -d --no-deps seam-server seam-worker
"
```

**Find the previous deploy tag:**

```bash
git -C /home/ty/workspace/tacklines/seam tag --sort=-version:refname | grep '^deploy-' | head -2 | tail -1
```

After rollback, re-run Phase 3 verification to confirm the previous version is healthy.

**File a task to investigate the failure:**

```bash
# If in a Seam session:
# call create_task(task_type: "bug", title: "Deploy failure [date]: investigate and fix", ...)
# Otherwise, note it in memory:
cat >> memory/scratch/deploy-failure-$(date +%Y%m%d).md << 'EOF'
# Deploy Failure

Date: $(date)
Failed SHA: <sha>
Rolled back to: <prev-sha>
Error: <what triggered rollback>

## Next steps
- [ ] Reproduce locally
- [ ] Fix root cause
- [ ] Re-run /seam-deploy after fix
EOF
```

Clean up checkpoint:

```bash
rm -f memory/scratch/seam-deploy-checkpoint.md
```

---

## Special Mode: Status Only

When `$ARGUMENTS` is `status`, skip Phases 0-2 and run only Phase 3 verification. Report production health without deploying.

Useful for checking if the current production version is healthy after a period of operation.

---

## Guidelines

1. **Gate is mandatory.** Never skip Phase 0. A failed compile or test is not a blocker to skip — it is a blocker to fix.
2. **Confirm before pushing.** `git push origin main` triggers a production deploy in CI mode. Always get explicit user confirmation before running it. This is irreversible on short timescales.
3. **Note the health check gap.** The Dockerfile HEALTHCHECK references `/api/health` which does not yet exist. Treat a non-5xx response from `/api/` as a passing signal. This known issue should be tracked and fixed separately.
4. **EC2 is pull-only.** EC2 can pull images from ECR via its instance profile but cannot push. Never attempt `docker push` from EC2.
5. **Rollback first, investigate second.** If the deploy is failing and users are affected, roll back immediately. Investigation can happen from a stable state.
6. **Compaction resilience.** This skill has 4 phases. Update `memory/scratch/seam-deploy-checkpoint.md` at each phase boundary per `rules/compaction-resilience.md`. Delete it on successful completion.
7. **Secrets stay out.** Do not print SSM parameter values to output. Reference secrets by parameter name only in logs and checkpoint files.
8. **Deploy tag is the audit trail.** Every successful deploy must be tagged. The tag is how rollback finds the previous stable image SHA.

## Known Issues

- `/api/health` endpoint does not exist — the Dockerfile HEALTHCHECK will always fail. Treat this as advisory.
- EC2 push to ECR is not permitted — build must happen locally or in CI.
- Zitadel JWT access tokens lack profile claims — the server calls userinfo endpoint for each request. Not a deploy blocker.

## See Also

- `/seam-drive` — Autonomous implementation that produces commits ready to deploy
- `/seam-review` — Code review before deploying
- `/seam` — Session management (join a session to file post-deploy tasks or bugs)
