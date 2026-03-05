# Seam Trial: Project Dashboard Redesign

Date: 2026-03-05
Session: 78FCWB (agent code 7LBX9BQR)
Epic: TASK-52 (Redesign project detail page)
Commit: `55e89b6`

## What this was

A Claude Code agent joined a live Seam session and redesigned the project detail page from a broken tab-based layout into a clean dashboard. The work was tracked as an epic with three child stories in the same Seam session, with the agent creating tasks, posting design questions as comments, implementing changes, and closing tickets with commit SHAs — all through the Seam MCP tools.

## The problem

The project detail page had four issues:

1. **Empty sidebar.** The app shell renders a 260px sidebar that only populates during active sessions. On the project page (no session), this was just dead space.
2. **Sessions buried in a tab.** Sessions were hidden behind a "Sessions" tab at the bottom of the page. The primary action — joining or creating a session — required navigating to a non-default tab and scrolling down.
3. **All tasks loaded at once.** The project view embedded the full task board component, loading every task the project had ever created (55 tasks in this case). No filtering, no limits.
4. **Bespoke styling.** Hand-rolled CSS for session rows when the project already had a design system (Shoelace components + custom CSS variables) with established card patterns on the project list page.

## The workflow

### 1. Join and orient

The agent joined the Seam session via MCP (`join_session` with the 8-character agent code), then explored the codebase to understand the current state — reading the project-workspace component, app-shell layout, task API, and design system variables.

### 2. Create the epic and stories

Rather than working from a separate plan document, the agent created the work items directly in Seam:

| Ticket | Type | Title |
|--------|------|-------|
| TASK-52 | Epic | Redesign project detail page |
| TASK-53 | Story | Hide sidebar on non-session pages and use full-width layout |
| TASK-54 | Story | Replace tabs with unified dashboard layout |
| TASK-55 | Story | Limit project-level task display to recent/open tasks |

All tasks were created with descriptions, priorities, and complexity ratings via the Seam MCP `create_task` tool.

### 3. Ask a design question

Before implementing, the agent posted a design question as a comment on TASK-54 using `add_comment`, @mentioning the human host and proposing the dashboard layout approach. This used Seam as the communication channel rather than interrupting the human directly.

The question laid out the key insight: the full task board (kanban, filters, batch operations) is a session-level activity. The project page should be an overview/launchpad, not a duplicate of the session workspace.

### 4. Implement

Two files changed:

**`app-shell.ts`** — Added a `no-sidebar` CSS class applied when there's no active session. The sidebar grid column collapses to 0 and the sidebar element is hidden via `display: none`. Two lines of CSS, one class toggle in the render method.

**`project-workspace.ts`** — Full rewrite. Removed the tab-group layout and task-board embedding. Replaced with:
- **Project header**: back link, project name, ticket prefix badge
- **Sessions grid**: 3-column card layout with active sessions (green online dot) sorted first, inactive sessions capped at 8, plus a "New Session" dashed-border CTA card. Session creation moved to a Shoelace dialog.
- **Task summary**: stats chips (Open / In Progress / Done / Closed counts) + a compact list showing only open and in-progress tasks, sorted by most recently updated, capped at 25 rows. Each row shows type icon, ticket ID, title, priority icon, status badge, and relative timestamp.

All styling reuses existing design system variables (`--surface-card`, `--border-subtle`, `--sl-border-radius-large`, `--shadow-xs/md`, etc.) matching the card patterns established in `project-list.ts`.

### 5. Verify

The agent ran TypeScript type checking (`tsc --noEmit`) and a production build (`vite build`) to confirm no errors. Then used Playwright to navigate the app, log in, and screenshot both the project list (confirming sidebar hidden) and the project dashboard (confirming the new layout with sessions grid and task summary).

### 6. Commit and close

Single commit with a conventional commit message. All four Seam tickets closed via `close_task` with the commit SHA linked for traceability.

## What the Seam workflow felt like

### The good

**Task creation as thinking out loud.** Creating the epic and stories wasn't just project management overhead — it was the design process. Breaking the work into three stories forced the agent to articulate what "fix the project page" actually meant: sidebar behavior, layout structure, and data loading were three distinct concerns.

**Comments as async design review.** Posting the design question on TASK-54 was natural. The agent didn't need to pause and wait for approval — it posted the question, noted the direction seemed clear from the user's description, and continued. The comment exists as a record of the decision rationale.

**Commit SHA linking.** Closing tickets with `commit_sha` creates traceability from work item to code change. When someone asks "what changed for TASK-54?", the answer is `git show 55e89b6`.

**Status transitions as progress signals.** Moving TASK-53 to `in_progress`, then `done`, then closing it — the human host could see this happening in real time on the task board without the agent needing to narrate its progress.

### The friction

**No inline task creation from comments.** The agent posted a design question as a comment, but if the answer had been "actually, also do X", there's no way to create a task directly from that comment thread. The agent would need to manually create a new task and reference the comment.

**All stories got the same commit SHA.** The three stories were logically distinct but landed in one commit because they were implemented together. Ideally each story would map to its own commit, but the changes were intertwined (the dashboard layout change inherently included the task limiting and sidebar removal).

**Question-asking is comment-based, not structured.** The agent posted a design question as a markdown comment with an @mention. Seam has a dedicated question-panel component for structured questions (with answer tracking), but the MCP tools don't yet expose question creation — only task comments. A `create_question` MCP tool would make design questions first-class.

## Comparison to previous sessions

This was the third distinct workflow pattern observed across Seam trial sessions:

1. **Drive session (TASK-12, -26, -35, -36):** Long-running autonomous implementation. The agent picked tasks from the backlog and ran a sustained build loop. The backlog was the plan.
2. **Bug filing (TASK-14, -17):** Agent encountered issues and filed them as bug tickets. Reactive, not planned.
3. **This session (TASK-52 through -55):** User-directed redesign with the agent creating its own epic and stories, asking design questions, and implementing in one pass. The agent was both planner and implementer.

The third pattern is the most natural for design work. The human provides the problem statement ("this page is broken, make it good"), the agent decomposes it into trackable work, validates the approach, and executes. The Seam session serves as both the coordination layer and the audit trail.

## What would make this better

1. **Structured questions via MCP.** A `create_question` tool that creates a question in the question panel (not just a comment) with answer options. The agent could ask "Dashboard layout: option A or B?" and the human could click an answer.
2. **Task templates for common patterns.** "Redesign a page" always involves layout, data loading, and styling. A template could scaffold the stories.
3. **Screenshot attachment on tasks.** The agent took Playwright screenshots to verify the design but couldn't attach them to the task. A `attach_file` MCP tool would make visual verification part of the task record.
4. **Finer commit granularity.** Encouraging one-story-per-commit would improve traceability, but requires the agent to structure its implementation pass more carefully.
