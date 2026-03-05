---
name: seam-standup
description: "Aggregate recent session activity and post a standup summary to Seam shared notes. Covers: done since last standup, in-progress work, blockers, and open questions needing attention. Keywords: seam, standup, status, summary, progress, blockers."
argument-hint: "[since: <duration or 'last'>]"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(git:*), mcp__seam__my_info, mcp__seam__list_tasks, mcp__seam__list_activity, mcp__seam__list_questions, mcp__seam__get_note, mcp__seam__update_note, mcp__seam__get_session
context: inline
---

# Seam-Standup: Session Status Summary

You are running **Seam-Standup** — a status aggregation skill that collects recent activity from git, the Seam task board, and session questions, then posts a formatted standup summary to the session shared notes. Duration: **$ARGUMENTS**

## When to Use

- At the start of a session to orient on what happened while you were away
- At the end of a `/seam-drive` cycle to summarize progress
- When the human wants a quick status update without reviewing every task
- Periodically during long sessions to checkpoint progress

## Overview

```
Verify session + determine time window
  -> Gather: git log, task changes, questions, activity feed
    -> Synthesize into standup format
      -> Post to session notes (slug: standup)
```

---

## Phase 0: Determine Window

### 0a. Verify Session

Call `my_info()` to confirm active session.

### 0b. Parse Time Window

| Argument | Window |
|---|---|
| `since: last` or empty | Since the last standup note was written (check `get_note(slug: "standup")` for timestamp) |
| `since: 1h` | Last hour |
| `since: 4h` | Last 4 hours |
| `since: 1d` | Last day |
| `since: <sha>` | Since a specific commit |

If no prior standup exists and no duration specified, default to the last 4 hours.

---

## Phase 1: Gather

Collect data from four sources:

### 1a. Git Activity

```bash
git log --oneline --since="<window>" --format="%h %s (%an, %ar)"
```

Count commits. Note which authors contributed.

### 1b. Task Changes

Call `list_activity(limit: 100)`. Filter to the time window.

Categorize:
- **Completed**: Tasks moved to done or closed
- **Started**: Tasks moved to in_progress
- **Created**: New tasks filed
- **Commented**: Comments added (notable ones only — skip routine status updates)

### 1c. Open Questions

Call `list_questions(status: "pending")`.

Any pending question is a potential blocker. Note who asked and how long it's been waiting.

### 1d. Current State

Call `list_tasks(status: "in_progress")` — what's actively being worked on.
Call `list_tasks(status: "open")` — what's ready to work next.

---

## Phase 2: Synthesize and Post

Build the standup note:

```markdown
# Standup: <date and time>

**Window**: <since when>
**Commits**: N | **Tasks closed**: N | **Tasks opened**: N

## Done
- TASK-N: <title> (commit: <sha>)
- TASK-N: <title> (commit: <sha>)

## In Progress
- TASK-N: <title> (assigned to: <name>)

## Blockers & Questions
- Q-N: <question> — waiting <duration> (directed to: <name or "anyone">)
- TASK-N: blocked by TASK-M

## Up Next
- TASK-N: <title> (priority: <p>)
- TASK-N: <title> (priority: <p>)

## Highlights
<1-3 sentences noting anything interesting: velocity trends, repeated patterns, surprising findings>
```

Post to session notes:
```
call update_note(slug: "standup", title: "Standup: <date>", content: "<standup markdown>")
```

Report the summary to the user as well (don't just silently post to notes).

---

## Guidelines

1. **Concise over complete.** The standup should be scannable in 30 seconds. Link to tasks for details.
2. **Highlight blockers.** Questions waiting more than 30 minutes and blocked tasks get top billing.
3. **Don't fabricate.** Only report what you can verify from git log, task status, and activity feed.
4. **Overwrite the note.** Each standup replaces the previous one (same slug: "standup"). The activity feed preserves history.

## See Also

- `/seam` — Session management (prerequisite)
- `/seam-drive` — What generates most of the activity you're summarizing
- `/seam-review` — For reviewing code quality (not just summarizing progress)
