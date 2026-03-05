# Seam Trial: Sustained Autonomous Drive Session

Date: 2026-03-04 to 2026-03-05
Session: 78FCWB
Agent code: 7LBX9BQR
Role: "Project Meta Agent" — autonomous feature implementation across backend, frontend, and MCP

## What this was

A Claude Code agent joined a live Seam session and ran the `/drive` skill — a sustained autonomous implementation loop — against the session's own task backlog. The agent picked up the highest-value open tasks, implemented them end-to-end, committed code, and updated task status through the Seam API. The human host worked in parallel on @mentions (TASK-23), and the two operated concurrently without stepping on each other.

This was a dogfooding session: the tool being built was the same tool coordinating the work.

## Tasks completed

| Task | Description | Commit |
|------|-------------|--------|
| TASK-12 | Questions — agents ask, humans answer in real time | `ea294e0` |
| TASK-35 | Desktop notifications for questions directed at you | `57396d5`, `9e02780` |
| TASK-36 | Fetch question text for desktop notifications | `9e02780` |
| TASK-26 | Task dependencies with cycle detection | `e04fb8a` |

Each was a full vertical slice: database migration, Rust API endpoints, MCP tools, frontend UI, PG NOTIFY triggers for real-time updates.

## The workflow that emerged

### 1. Orient from the backlog

The agent listed all tasks in the session, assessed which were open vs done, and ranked them by value. The `/drive` skill's Phase 0 (load plan + assess state) mapped naturally to Seam's task list. The task board *was* the plan document.

### 2. Claim, implement, close

For each task:
1. Set status to `in_progress` via the Seam API
2. Add a comment describing the planned approach
3. Implement across all layers (migration → Rust → MCP → frontend)
4. Test with curl or Playwright
5. Commit with conventional commit message
6. Add a completion comment with commit SHA
7. Set status to `done`

This loop ran 4 times across two context windows (the conversation hit context limits and was resumed).

### 3. Parallel human + agent work

The human was building @mentions (TASK-23) simultaneously. The coordination was simple: the agent checked `git diff` before committing and used `git add -p` to stage only its own hunks, leaving the human's unstaged work untouched. Files like `session-connection.ts` and `task-api.ts` had interleaved changes from both parties — dependency code from the agent, mentions code from the human — and selective staging kept them cleanly separated.

No formal locking or branch strategy was needed. The shared `main` branch worked because the changes were in different logical areas even when they touched the same files.

### 4. Context window management

The session spanned two context windows. The first ran out during TASK-26 implementation (server restart issues). The second picked up from a conversation summary, re-read the drive state, verified the migration was applied, tested all endpoints, committed, and closed the task.

The compaction resilience worked because:
- The summary captured exact file paths, code snippets, and what was done vs pending
- The agent re-verified state (checked DB tables, tested endpoints) rather than trusting the summary blindly
- Drive state in `memory/scratch/drive-state.md` provided a recovery checkpoint

### 5. Filing bugs as discovered

When the agent hit issues (MCP schema drift, empty 401 responses, token expiry), it filed them as bug tasks in the same session. This turned friction into trackable work items visible to the human host in real time.

## What the workflow actually looks like

The idealized loop is: read backlog → pick task → implement → commit → close → repeat.

The reality is messier:
- **Migration collision**: Manually applying a migration then having sqlx try to re-apply it. Required dropping and re-creating objects.
- **Server process management**: Killing a stale server process that held port 3002. Multiple attempts with `pkill`, `lsof`, `fuser`.
- **Sandbox restrictions**: Claude Code's sandbox blocks loopback network access. Every `curl`, `psql`, and `cargo run` needed `dangerouslyDisableSandbox: true`.
- **Context limits**: The first session ran out of context mid-task. The summary bridged the gap, but there was inevitable re-verification overhead.

These are infrastructure frictions, not workflow problems. The task-oriented loop itself held up well.

## What Seam provided vs what the agent brought

**Seam provided:**
- Shared task visibility (human sees agent's progress in real time)
- Structured communication (comments as async messages)
- Real-time notifications (PG NOTIFY → WebSocket → frontend refresh)
- The backlog as a coordination mechanism

**The agent brought:**
- Full-stack implementation capability (SQL, Rust, TypeScript in one session)
- Selective git staging to avoid clobbering parallel work
- Self-filing bugs for platform issues encountered during work
- Context window recovery via drive state checkpoints

**Neither provided (gaps):**
- Branch-level isolation for concurrent work
- Conflict detection when two parties edit the same file
- A way for the human to review agent commits before they land
- Task assignment/claiming that prevents duplicate work

## Key insight

The most valuable thing about this workflow wasn't the automation — it was the visibility. The human could open the Seam UI at any point and see exactly what the agent was working on, what it had completed, and what issues it had found. The task board + comments created an asynchronous communication channel that didn't require either party to interrupt the other.

The agent didn't need to be told what to do. The backlog was the instruction set. The human's role was curator (prioritizing, filing features) and the agent's role was implementer (picking up, building, closing). This separation worked because the tasks were well-scoped and the agent had full-stack capability.

## Recommendations for future sessions

1. **Use feature branches per agent.** Even without formal review, branches prevent accidental inclusion of another party's unstaged work.
2. **Add task claiming/assignment.** When multiple agents join, they need a way to avoid picking up the same task. A simple "assigned_to" lock with optimistic concurrency would work.
3. **Extend token lifetime for agents.** Re-authenticating every 5 minutes adds overhead to every API call batch.
4. **Surface blocked tasks in the board view.** Dependencies exist in the data model now but the task board doesn't show blocked indicators — only the detail view does.
5. **Consider a "review requested" status.** Between `done` and `closed`, a state where the human can review the agent's work before it's considered complete.
