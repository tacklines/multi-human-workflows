# Seam Trial: Agent-Driven Feature Work

Date: 2026-03-04
Session: 78FCWB
Agent code: 7LBX9BQR
Role: "Frontend Agent" — filed and implemented a design feature request

## What happened

An AI agent (Claude, via Claude Code) joined a live Seam session and performed a full feature lifecycle: filed a story with subtasks, implemented the code changes, verified them visually with Playwright screenshots, tracked progress through the Seam task API, and filed bugs for platform deficiencies encountered along the way.

A second agent session was working on the backend simultaneously, which surfaced a real coordination scenario when both sessions touched the same file.

## The workflow that emerged

### 1. Join and orient

The agent joined via `/api/agent/join` with the 8-character agent code. First friction: the join endpoint isn't `/api/sessions/{code}/join` (that's for humans) — it's a separate `/api/agent/join` path. This took a few failed attempts to discover.

After joining, the agent listed existing tasks to understand what work was already tracked.

### 2. File the feature request

The agent analyzed `task-detail.ts` (the existing implementation) and filed a story — "Redesign task detail view for better visual hierarchy and usability" — with a detailed description of 8 specific problems and a proposed approach. Then created 5 subtasks:

1. Header card with overflow menu
2. Click-to-edit sidebar metadata
3. Collapsed comment input
4. Description visual distinction
5. Activity timeline (backend-dependent)

Each subtask was created via `POST /api/sessions/{code}/tasks` with `parent_id` linking to the story. The agent set each to `in_progress` before starting work and `done` on completion.

### 3. Implement

The agent rewrote `task-detail.ts` — a complete structural overhaul from a flat form layout to a two-column design with a header card, right sidebar, click-to-edit pattern, and collapsed comment input. Subtasks 1-4 were implemented in a single pass. Subtask 5 (activity timeline) was deferred as it requires a backend `task_events` table that doesn't exist yet.

### 4. Verify visually

Used Playwright to navigate to the task detail view, fill in fields (which required shadow DOM workarounds — see bugs below), and take screenshots to verify the layout. The screenshots confirmed the redesign worked as intended.

### 5. File bugs as deficiencies surfaced

During the session, the agent filed 6 bugs for platform issues encountered:

| Bug | Category |
|-----|----------|
| 401 returns empty body instead of JSON error | API |
| `parent_id` filter doesn't work on task list | API |
| Keycloak tokens expire in 5 min with no refresh | Auth |
| MCP `list_tasks` crashes on missing columns | MCP |
| Playwright `fill()` fails on Shoelace shadow DOM | Testing |
| Agent `display_name` not respected on re-join | API |

These were filed as `bug` type tasks in the same session, visible to the human host in real time.

### 6. Collision with parallel session

The other agent session committed `f152f9b` which rewrote `task-detail.ts` as part of a larger "project-scoped tasks" feature. This commit included the frontend design changes (they were in the working tree when that session committed). The changes landed, but attribution was mixed — the design work was done by this session, the commit was made by the other.

## What worked well

**Task-as-communication.** Filing subtasks and updating their status gave the human host real-time visibility into what the agent was doing without requiring direct conversation. The task board served as a shared dashboard.

**Bug filing as you go.** Encountering a platform issue, filing a bug for it, and continuing with a workaround is a natural workflow. The bugs became a backlog of platform improvements — exactly what a dogfooding session should produce.

**Comments as breadcrumbs.** Adding comments when picking up a task ("Found the root cause: ...") and when completing it ("Committed in abc123") created an audit trail that a human can review asynchronously.

**The API is agent-friendly.** REST + JSON with predictable CRUD patterns. An agent can interact with every part of the system without special tooling. The MCP layer is a convenience, not a requirement.

## What didn't work

**Token expiry with no warning.** Keycloak tokens expire in 5 minutes. The API returns an empty body on 401 — no JSON, no error message. The agent burned several cycles debugging "empty responses" before realizing it was auth expiry. Every API call batch required a fresh token.

**Agent join is a separate endpoint.** The join flow for agents (`/api/agent/join`) is different from humans (`/api/sessions/{code}/join`), but this isn't documented anywhere the agent can discover it. It required grepping the server source code.

**MCP was broken.** The MCP server had uncommitted changes referencing database columns that didn't exist yet (schema drift from an in-progress feature branch). This meant all MCP task tools crashed. The agent fell back to raw HTTP, which worked fine but defeated the purpose of having MCP tools.

**Shadow DOM blocks standard testing.** Playwright's `fill()` doesn't penetrate Shoelace's shadow DOM. Every form interaction required a custom `page.evaluate()` with a recursive shadow root traversal helper. This is a significant barrier to automated testing.

**No conflict detection for concurrent edits.** Two agent sessions editing the same file had no coordination mechanism. The second commit silently included the first session's uncommitted changes. In a real multi-agent scenario, this could cause lost work or confusing diffs.

## Recommendations

1. **Refresh tokens automatically** or extend token lifetime for agent sessions. Agents shouldn't need to re-authenticate every 5 minutes.

2. **Return JSON error bodies on 401/403.** `{"error": "token_expired", "message": "..."}` is trivially parseable. An empty body is not.

3. **Document the agent join flow.** A `GET /api/agent/help` or a note in the session join response would save agents from grepping source code.

4. **Gate MCP startup on schema validation.** If the MCP server's queries reference columns that don't exist, fail at startup with a clear message rather than crashing on first tool call.

5. **Add optimistic locking or file-level coordination.** Even a simple "last-modified" check on task updates would prevent silent overwrites between concurrent sessions.

6. **Provide a Playwright test utilities module** with shadow DOM helpers for Shoelace components. This benefits both human and agent testers.

## Summary

The core loop — join, file tasks, implement, update status, comment — works. Seam is usable as a coordination layer for agent work today. The rough edges are all in the infrastructure around it: auth lifecycle, error reporting, MCP reliability, and multi-agent conflict handling. These are solvable problems, and the session itself generated the bug tickets to track them.
