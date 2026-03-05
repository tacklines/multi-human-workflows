# Seam Trial: First Collaborative Bug Fix

**Date:** 2026-03-05
**Session:** 78FCWB (agent code: 7LBX9BQR)
**Participants:** Test User (human), Claude (agent)
**Task:** TASK-51 — GET /api/projects returns 404

## What Happened

The human opened Seam's UI and couldn't create a project. The "New Project" card was visible and the create dialog rendered, but the underlying API call (`GET /api/projects`) returned 404 — so the project list never loaded and project creation silently failed.

The human shared the server log line showing the 404, the agent joined the session via MCP, filed a bug as TASK-51, diagnosed the issue, pushed a fix, and closed the task.

## The Workflow

```
Human: notices broken UI, shares server log
  |
Agent: joins Seam session via MCP (join_session)
  |
Agent: files TASK-51 (create_task, type: bug)
  |
Agent: reads frontend routing → reads server routes → reads Axum version
  |
Agent: identifies root cause (Axum 0.8 duplicate route registration)
  |
Agent: edits server/src/main.rs, verifies compilation
  |
Agent: marks TASK-51 done (update_task, status: done)
```

Total: one conversation, one session, one task lifecycle from open to done.

## Root Cause

Axum 0.8 changed how duplicate route paths are handled. In Axum 0.7 and earlier, calling `.route("/path", get(x))` then `.route("/path", post(y))` would merge the methods. In 0.8, it silently returns 404 for the duplicated path.

The fix: chain method handlers on a single `.route()` call:

```rust
// Before (broken in Axum 0.8)
.route("/api/projects", get(list_projects))
.route("/api/projects", post(create_project))

// After (works)
.route("/api/projects", get(list_projects).post(create_project))
```

Six route groups were affected across projects, sessions, tasks, mentions, and notes endpoints.

## What Worked

**Task tracking inside the conversation.** The agent filed and closed the bug through MCP tools without switching context. The task appeared on the human's board in real time via WebSocket push. No copy-paste between a chat window and a ticket tracker.

**Shared session context.** Both the human and agent were in session 78FCWB. The task was scoped to that session's project, so it showed up in the right place with the right ticket prefix (TASK-51) automatically.

**Log-driven debugging.** The human sharing the raw server log (`status=404`, `uri=/api/projects`) was the fastest path to diagnosis. The agent didn't need to reproduce the bug — the log was sufficient signal.

## What Didn't Work

**Initial misread of the problem.** The human said "I can't figure out how to start a project" — which sounded like a UX discoverability issue. The agent started reading frontend components looking for missing UI affordances. It was actually a backend 404 making the whole feature non-functional. The server log redirected the investigation.

**No test coverage.** The fix was verified by `cargo check` only. There's no integration test that catches duplicate route registration. A startup smoke test hitting each endpoint would have caught this at deploy time.

## Observations on the Seam Model

1. **MCP as the agent interface works.** `join_session`, `create_task`, `update_task` — the agent used the same data model the human sees. No translation layer, no separate "agent API."

2. **Tasks as shared artifacts.** The bug report the agent filed is the same object the human sees on their task board. Not a chat message that someone has to manually promote to a ticket.

3. **Session scoping keeps things clean.** The task was automatically associated with the session's project. No org/project picker needed — context flows from the session.

4. **The feedback loop is tight.** Human reports → agent files task → agent fixes → agent closes task → human sees it all update live. The whole cycle happened in under 5 minutes in a single conversation.
