# Seam Trial: Adding Projects as Top-Level Grouping

Date: 2026-03-05
Session: 78FCWB
Epic: "Projects as top-level grouping" (6 stories, 2 commits)

## What this was

A `/drive` session to add projects as the top-level organizational unit in Seam. The user's prompt was deliberately loose: "we need projects as a top level grouping of sessions and tasks. tasks are part of projects, they just surface and get worked in sessions (or sessions are a way that happens)."

The agent decomposed this into backend and frontend work, implemented it across two commits, and closed the epic — all within a single drive cycle that spanned two context windows.

## The plan that emerged

The prompt's key insight was that tasks belong to projects, not sessions. Sessions are where work happens, but the project is the durable container. This drove every design decision:

1. **Projects table + CRUD API** — Organizations own projects, projects own sessions
2. **Session gets a project_id** — Sessions are created within a project context
3. **SessionView includes project info** — So the frontend knows which project a session belongs to
4. **Project workspace UI** — A page showing a project's tasks and sessions
5. **Project-scoped task routes** — Read-only views of all tasks across a project's sessions
6. **MCP already had it** — The MCP tools already operated at project scope via `require_project()`

## What actually happened

### Backend first, clean commit boundary

The first commit (`84d3465`) handled all backend work:
- Migration adding `projects` table and `project_id` FK on sessions
- Full CRUD routes (`/api/projects`, `/api/projects/{id}`)
- Project sessions listing (`/api/projects/{id}/sessions`)
- Updated `SessionView` to include project name and ID
- Project-scoped read-only task routes (`/api/projects/{id}/tasks`)

### Frontend second, another clean commit

The second commit (`4d51667`) built the UI:
- `project-list.ts` — Grid of project cards with create dialog
- `project-workspace.ts` — Tabbed view (Tasks | Sessions) for a single project
- `task-board.ts` gained a `project-id` property for dual-mode operation
- `task-detail.ts` gained `readonly` mode for project-scoped viewing
- `app-shell.ts` got hash-based routing: `#projects`, `#project/{id}`, `#session/{code}`

### The read-only decision

The most interesting design decision was making project-level task views read-only. The `created_by` column on tasks references `participants(id)`, meaning you need to be a session participant to create or edit tasks. Rather than fighting this constraint, we leaned into it — it matches the user's intent that sessions are where work gets done. The project view is for orientation and oversight.

### MCP was already project-scoped

TASK-44 (MCP project context) turned out to be a no-op. The MCP tools already resolve the current project via `require_project()` from the session state, and all task queries already filter by `project_id`. Closed with a comment explaining why.

## Context window recovery

This drive spanned two context windows. The first window completed all backend work and most frontend work. When context compacted, the drive state file (`memory/scratch/drive-state.md`) preserved which stories were done and which remained, allowing clean resumption.

The recovery worked because:
- Each story had a clear done/not-done status in Seam's own task board
- The commit history showed exactly what code existed
- The conversation summary captured key decisions (like the read-only constraint)

## What the workflow looks like now

```
Organization
  └── Project (e.g., "Seam Platform")
        ├── Sessions (where humans + agents join and work)
        │     └── Tasks (created, assigned, discussed in session context)
        └── Tasks (read-only aggregate view across all sessions)
```

Users land on a project list, drill into a project workspace to see all tasks and sessions, then join a session to do actual work. The project workspace gives oversight; the session gives agency.

## Observations

**Loose prompts work when the domain is clear.** The user's one-sentence plan was sufficient because the domain model was already understood. The agent didn't need a detailed spec — it needed permission to make reasonable decisions within a known architecture.

**Backend-first is natural for full-stack features.** Both commits compiled and type-checked clean. Doing the backend first meant the frontend had real API contracts to code against, not imagined ones.

**Existing constraints are features.** The `created_by → participants(id)` FK constraint initially looked like a problem for project-scoped task creation. Reframing it as an intentional boundary ("sessions are where work happens") produced a cleaner design than working around it would have.

**6 stories, 2 commits.** The stories were fine-grained for tracking but the natural commit boundaries were coarser. This is fine — the stories served as a checklist, the commits served as atomic deployable units.
