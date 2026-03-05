---
name: seam
description: "Work with Seam collaborative sessions: join sessions via agent code, manage tasks through MCP tools, track progress with comments and status updates, and coordinate with human participants. Keywords: seam, session, collaborate, tasks, agent, join, mcp."
argument-hint: "<agent-code | join <code> | tasks | create <type> <title> | ask <question> | note <slug>>"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(git:*), mcp__seam__join_session, mcp__seam__get_session, mcp__seam__my_info, mcp__seam__create_task, mcp__seam__list_tasks, mcp__seam__get_task, mcp__seam__update_task, mcp__seam__add_comment, mcp__seam__close_task, mcp__seam__claim_task, mcp__seam__add_dependency, mcp__seam__remove_dependency, mcp__seam__ask_question, mcp__seam__check_answer, mcp__seam__cancel_question, mcp__seam__list_questions, mcp__seam__list_activity, mcp__seam__get_note, mcp__seam__update_note
context: inline
---

# Seam: Collaborative Session Management

You are running **Seam** — the gateway skill for working with Seam collaborative sessions. Seam sessions are where humans and AI agents coordinate work in real time through structured tasks, comments, questions, and shared notes. Your command: **$ARGUMENTS**

## When to Use

- When you need to join a Seam session and start working
- When you want to create, update, or close tasks in a live session
- When you need to ask a blocking question and wait for a human answer
- When you want to read or update shared session notes
- When you need to see session status, participants, or activity
- As the precondition before running `/seam-drive`, `/seam-plan`, or other Seam workflows

## Overview

```
Check MCP availability
  -> Parse command mode from $ARGUMENTS
    -> Execute: join | orient | tasks | create | comment | ask | note | status
      -> Report result
```

---

## Phase 0: MCP Availability Check

Before anything else, verify the Seam MCP tools are available.

Call `my_info` to check for an active session. Three outcomes:

1. **Already in a session**: Report session code and proceed with the command.
2. **MCP available but no session**: Tools are available but you need to join first. If the command isn't `join`, prompt for an agent code.
3. **MCP not available**: The Seam MCP server is not configured. Tell the user:
   > "Seam MCP tools are not available. To connect, add the seam MCP server to your Claude Code configuration with your agent code."

---

## Phase 1: Parse Command Mode

Parse `$ARGUMENTS` to determine the mode. Support these patterns:

| Input Pattern | Mode | Action |
|---|---|---|
| `<8-char code>` | join | Join session with this agent code |
| `join <code>` | join | Join session with this agent code |
| `join <code> as <name>` | join | Join with a display name |
| `tasks` | list-tasks | List all open tasks |
| `tasks <filter>` | list-tasks | List tasks with filter (status, type, priority) |
| `create <type> <title>` | create | Create a task |
| `comment <task-id> <message>` | comment | Add a comment to a task |
| `close <task-id>` | close | Close a task |
| `ask <question>` | ask | Ask a blocking question |
| `note <slug>` | note | Read a shared note |
| `note <slug> <content>` | note-update | Update a shared note |
| `activity` | activity | Show recent activity feed |
| *(empty or unmatched)* | status | Show session overview |

---

## Phase 2: Execute Command

### Mode: join

1. Call `join_session` with the agent code and optional display name.
2. On success, report:
   - Session code and project name
   - Your participant ID and sponsor name
   - Number of other participants currently in the session
3. Call `list_tasks` with no filters and summarize:
   - Total tasks, grouped by status (open / in_progress / done / closed)
   - Any tasks assigned to you
   - Open questions awaiting answers
4. Call `list_activity` (limit: 5) and show recent activity as context.

**This is the orientation step.** Give the user a complete picture of the session state.

### Mode: list-tasks

1. Parse filter keywords from the arguments:
   - Status keywords: `open`, `in_progress`, `done`, `closed`
   - Type keywords: `epic`, `story`, `task`, `subtask`, `bug`
   - Priority keywords: `critical`, `high`, `medium`, `low`
   - Text search: anything that isn't a recognized keyword
2. Call `list_tasks` with the parsed filters.
3. Display results in a compact table:
   ```
   | Ticket | Type | Title | Status | Priority | Assignee |
   ```
4. If any tasks have children, note their child counts.

### Mode: create

1. Parse task type and title from arguments. Expect: `create <type> <title>`.
   - Valid types: `epic`, `story`, `task`, `subtask`, `bug`
   - Everything after the type is the title
2. Call `create_task` with the type and title.
3. Report the created task's ticket ID.
4. Ask if the user wants to add a description, priority, or parent.

### Mode: comment

1. Parse task ID and message from arguments.
   - The first token after `comment` that looks like a UUID or TASK-N reference is the task ID.
   - If a TASK-N reference is given, call `list_tasks` with search to resolve it to a UUID.
   - Everything else is the comment content.
2. Call `add_comment` with the task ID and content.
3. Confirm the comment was posted.

### Mode: close

1. Parse task ID from arguments.
   - Resolve TASK-N references as in comment mode.
2. Check if there's a recent commit that should be linked:
   ```bash
   git log --oneline -1
   ```
3. Call `close_task` with the task ID and optional commit SHA.
4. Report the closure.

### Mode: ask

1. Parse the question text from arguments (everything after `ask`).
2. Call `ask_question` with the question text.
   - No directed_to by default (open question to any human).
   - Set a reasonable TTL (900 seconds / 15 minutes) unless the user specifies otherwise.
3. Report the question ID.
4. Tell the user: "Question posted. I'll check for an answer when needed. You can also run `/seam check <question-id>` to check manually."

### Mode: note

1. Call `get_note` with the slug from arguments.
2. Display the note title and content.
3. If the note doesn't exist, tell the user and offer to create it.

### Mode: note-update

1. Parse slug and content from arguments.
2. Call `update_note` with the slug and content.
3. Confirm the update.

### Mode: activity

1. Call `list_activity` (limit: 20).
2. Display the activity feed in chronological order.
3. Highlight items involving the current participant.

### Mode: status

1. Call `get_session` to get session info.
2. Call `list_tasks` to get task counts by status.
3. Call `list_questions` (status: pending) to get open questions.
4. Call `list_activity` (limit: 5) to get recent activity.
5. Display a session dashboard:

```
## Session: <code> | Project: <name>

### Participants
- <name> (role) — online/offline

### Task Summary
- Open: N | In Progress: N | Done: N | Closed: N
- Assigned to you: N

### Open Questions
- Q-1: <question text> (asked by <name>, <time ago>)

### Recent Activity
- <event> — <time ago>
```

---

## Phase 3: Ticket ID Resolution

Many commands reference tasks by ticket ID (e.g., `TASK-42`). The MCP tools use UUIDs internally. When a user provides a ticket ID:

1. Call `list_tasks` with `search: "TASK-42"` (using the ticket ID as search text).
2. If exactly one result matches, use its UUID.
3. If multiple results match, show them and ask the user to clarify.
4. If no results, report: "No task found matching TASK-42."

Cache resolved IDs within the session to avoid repeated lookups.

---

## Guidelines

1. **MCP check is mandatory.** Never try to call Seam tools without verifying availability first. A clear "MCP not configured" message saves cycles.
2. **Orient on join.** The join response should give a complete picture — not just "joined successfully" but the full session state. This is the first thing a human or downstream skill sees.
3. **Use ticket IDs in output.** When displaying tasks, always show the TASK-N ticket ID. UUIDs go in the API calls; ticket IDs go in the human-readable output.
4. **Comments are for meaningful updates.** Don't comment on tasks for trivial actions. Comment when: starting work (planned approach), hitting a decision point, completing work (commit SHA), or filing a finding.
5. **Questions block.** When you ask a question, you're saying "I can't proceed without an answer." Don't ask questions for things you can figure out yourself. Don't ask FYI questions — use comments for those.
6. **Notes are durable.** Shared notes persist across the session. Use them for summaries, decisions, and reference material — not ephemeral status.
7. **Fail gracefully on auth.** If a Seam API call returns an error (especially auth-related), report it clearly and suggest re-joining. Don't retry silently.

## See Also

- `/seam-drive` — Autonomous implementation against the Seam backlog
- `/seam-plan` — Decompose a goal into a Seam task hierarchy
- `/seam-triage` — Investigate and triage bugs/tasks in a session
- `/seam-review` — Code review with findings posted to Seam
- `/seam-standup` — Session status summary posted to shared notes
