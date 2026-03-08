# Seam Trial: Building a Product With Its Own Tools

Date: 2026-03-04 to 2026-03-05
Session: 78FCWB
Epic: TASK-19 — Core Collaboration Features (16 commits, 11 stories, 6 bugs fixed)

## What this was

A human and AI agent pair used Seam — the product they were building — to coordinate the construction of Seam's own collaboration features. The human filed an epic ("Core Collaboration Features") through the Seam session, and a Claude Code agent ran `/drive` to implement it story by story while the human worked in parallel. A second agent session handled one story concurrently.

The full epic took ~8 hours across 3 context windows. By the end, the platform had grown from "sessions with a task list" to a collaboration tool with activity feeds, @mentions, dependencies, shared notes, agent questions, presence indicators, task assignment, and markdown rendering.

## The workflow that settled

### Planning: blossom → backlog

The epic started with `/blossom` — an exploratory spike that analyzed the existing codebase, identified gaps, and proposed 8 stories ranked by value. These became children of the epic in Seam's own task board. The human reviewed the proposed stories and approved the plan without modification.

This worked better than upfront planning because the spike read actual code and filed stories that matched real gaps rather than imagined requirements.

### Execution: vertical slices, always

Every story followed the same pattern:

```
1. Migration SQL (server/migrations/NNN_feature.sql)
2. Rust API routes (server/src/routes/tasks.rs)
3. MCP tool (server/src/mcp.rs)
4. Frontend component (frontend/src/components/)
5. Real-time WebSocket events (PG NOTIFY → WS → UI refresh)
6. Commit with conventional message
```

This wasn't prescribed — it emerged because each feature needed all layers to be usable. A half-built feature (API without UI, or UI without real-time updates) wasn't worth committing. The vertical slice pattern kept every commit deployable.

### Coordination: the task board as protocol

The human and agent never had a direct conversation about who does what. Instead:

- The human filed stories and set priorities
- The agent checked the backlog, picked the next open story, set it to `in_progress`, and started work
- Comments on tasks served as async status updates ("Starting migration for mentions table", "Committed in 2b06f4c")
- The task board reflected reality in real time via WebSocket push

This was Seam's thesis validated: structured tasks + real-time visibility replaces synchronous coordination.

### Parallel work: same branch, different concerns

The human built @mentions (TASK-23) while the agent built dependencies (TASK-26) simultaneously. Both touched `task-detail.ts`, `mcp.rs`, `session-connection.ts`, and `task-api.ts`. No branches, no PRs — both worked on `main`.

This worked because:
- Changes were in different logical sections of shared files
- Git's staging area allowed selective commits
- One party's uncommitted work didn't conflict with the other's commits

It also failed partially: the parallel worker's commit (`e04fb8a`) accidentally included the human's unstaged mentions code, mixing attribution. In a production setting, feature branches would prevent this.

### Context window recovery

The session spanned 3 context windows. Each time context compacted:
- The conversation summary captured file paths, code state, and pending work
- `memory/scratch/drive-state.md` tracked which stories were done vs remaining
- The agent re-verified state on resume (checked DB tables, tested endpoints, re-read modified files)

The recovery overhead was ~2-3 minutes per compaction. The drive state file was the critical piece — without it, the agent would need to rediscover what was already done.

## What was built

| Story | What it added |
|-------|--------------|
| TASK-20 | Project-scoped tasks with TASK-N ticket IDs |
| TASK-22 | Activity feed — who did what, when (DB events → frontend timeline) |
| TASK-23 | @mentions in comments with targeted WebSocket notifications |
| TASK-24 | Task assignment — claim/unclaim workflow |
| TASK-25 | Participant presence indicators (online/offline via WebSocket) |
| TASK-26 | Task dependencies with recursive CTE cycle detection |
| TASK-27 | Session-scoped shared notes (collaborative scratchpad) |
| TASK-28 | Priority and complexity fields on tasks |
| TASK-29 | Agent questions — agents ask questions, humans answer in real time |
| TASK-37 | Markdown rendering with marked + DOMPurify |

Plus 6 bugs fixed along the way (401 error bodies, MCP crashes, session persistence, agent display names, hash navigation, notification text).

## What the experience revealed about Seam

### What works

**Tasks as the coordination primitive.** The task board replaced planning documents, status meetings, and direct messages. Creating a task was equivalent to giving an instruction. Updating its status was equivalent to reporting progress. This is exactly the interaction model Seam was designed for.

**Real-time feedback loop.** PG LISTEN/NOTIFY → WebSocket → UI refresh meant the human saw task status changes within seconds. When the agent moved a task to `in_progress`, the board updated. When a comment was added, it appeared. This ambient awareness let the human work without checking in.

**Bug filing as dogfooding output.** Every platform deficiency the agent encountered became a tracked bug in the same session. The friction of using the tool generated its own improvement backlog. Six bugs were filed and four were fixed within the same session.

**MCP as agent interface.** The MCP tools (`join_session`, `create_task`, `update_task`, `add_comment`, `close_task`, `list_tasks`, `task_summary`) gave the agent a clean programmatic interface without needing to know HTTP endpoints. When MCP wasn't available (early in the session when it was broken), the agent fell back to raw HTTP — but MCP was significantly faster to use once working.

### What doesn't work yet

**No review gate.** Agent commits land directly on `main`. There's no "review requested" status, no PR flow, no way for the human to approve changes before they're committed. The human trusted the agent's output, but this doesn't scale to less-trusted agents or more critical code.

**No branch isolation.** Two agents on the same branch with overlapping file changes is fragile. The selective-staging workaround is clever but accident-prone. Feature branches per agent (or per task) would be more robust.

**Token lifecycle is hostile to agents.** Auth tokens expire in 5 minutes. Every batch of API calls risks a silent 401. Agent sessions should get longer-lived tokens or automatic refresh.

**No conflict detection.** If two agents update the same task, last-write-wins. No optimistic locking, no version field, no notification that your update was overwritten. This is fine for 1-2 agents but would cause data loss at scale.

**Questions are pull-based.** The agent questions feature (TASK-29) requires the human to have the Seam UI open and notice the notification. There's no push channel (email, Slack, SMS) for when the human is away. An agent blocked on a question just waits.

### Deficiencies encountered during this session

| Problem | Impact | Status |
|---------|--------|--------|
| MCP crashed on missing DB columns | Agent fell back to HTTP for first hour | Fixed (TASK-16) |
| 401 returns empty body | Agent couldn't distinguish auth failure from other errors | Fixed (TASK-13) |
| Session lost on page refresh | Human had to rejoin after every reload | Fixed (TASK-5) |
| Agent display_name ignored on rejoin | Agent showed wrong name after reconnect | Fixed (TASK-18) |
| Playwright can't fill Shoelace inputs | Visual testing requires shadow DOM workarounds | Open (TASK-17) |
| No token refresh for agents | Every API batch risks silent failure | Open (TASK-14) |

## How this changes the product direction

The session validated that Seam's core model — sessions with structured tasks, real-time updates, and MCP tools — is sufficient for human+agent collaboration on real work. The agent didn't need special affordances; it used the same task API a human would.

But it also showed that "sufficient" isn't "good." The gaps are in workflow maturity:

1. **Review flow.** Tasks need a `review_requested` status and a way to attach diffs or commit ranges for human review before closing.

2. **Agent workspace isolation.** Each agent should work on its own branch, with Seam managing the merge flow. This prevents the selective-staging accidents we hit.

3. **Push notifications beyond WebSocket.** When agents are blocked on questions or humans are away from the UI, there needs to be an out-of-band notification channel.

4. **Task claiming with conflict prevention.** `assigned_to` exists now but doesn't prevent a second agent from working on the same task. A lock or advisory mechanism would help.

5. **Session templates.** Starting a new session requires manually creating the epic, filing stories, and setting up the structure. Templates for common workflows (feature development, bug triage, code review) would reduce setup time.

## Summary

Seam works for what it's designed for: giving humans visibility into agent work and giving agents a structured way to communicate progress. The task board is the right primitive. The vertical slice implementation pattern (migration → API → MCP → frontend → commit) emerged naturally and kept every commit useful.

The biggest insight: **the human's role shifts from implementer to curator.** The human filed the epic, approved the plan, and reviewed results. The agent did the implementation. This division worked because the task system made the boundary clear — the human operates at the story level, the agent operates at the code level, and the task board is the interface between them.

The gaps are real but tractable. Review gates, branch isolation, and push notifications are all well-understood problems. The foundation is solid enough that the next epic can be built on top of it using the same workflow.
