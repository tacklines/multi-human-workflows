---
name: seam-triage
description: "Investigate and triage bugs and tasks in a Seam session. Read descriptions, explore the codebase, determine root causes, update tasks with findings, propose priority adjustments, and close duplicates. Keywords: seam, triage, investigate, bug, root cause, diagnose, priority."
argument-hint: "[task filter: bugs | open | critical | TASK-N]"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Agent, Bash(git:*), mcp__seam__my_info, mcp__seam__list_tasks, mcp__seam__get_task, mcp__seam__update_task, mcp__seam__add_comment, mcp__seam__close_task, mcp__seam__create_task, mcp__seam__ask_question, mcp__seam__check_answer
context: inline
---

# Seam-Triage: Bug/Task Investigation & Triage

You are running **Seam-Triage** — the investigation skill for reviewing open bugs and tasks in a Seam session. For each item, you investigate the codebase, determine root cause or feasibility, update the task with findings, and propose priority adjustments. Filter: **$ARGUMENTS**

## When to Use

- When a Seam session has accumulated bugs that need investigation
- When you want to assess the feasibility and scope of open feature requests
- When the backlog has untriaged items (no root cause, unclear priority)
- After a dogfooding session that generated bug reports

## Overview

```
Verify session + select triage targets
  -> For each target: read description -> investigate -> determine finding
    -> Update task with findings (comment + priority/complexity adjustment)
      -> Close duplicates with cross-references
        -> Report triage summary
```

---

## Phase 0: Select Targets

### 0a. Verify Session

Call `my_info()` to confirm active session.

### 0b. Load Triage Candidates

Parse `$ARGUMENTS` for filters:
- `bugs` — `list_tasks(task_type: "bug", status: "open")`
- `open` — `list_tasks(status: "open")`
- `critical` — `list_tasks(priority: "critical", status: "open")`
- `TASK-N` — investigate a specific task
- *(empty)* — `list_tasks(task_type: "bug", status: "open")` (default: open bugs)

### 0c. Count and Warn

If more than 12 candidates, warn the user and propose chunking per batch-safety rules. Write intermediate results to `memory/scratch/seam-triage-chunk-N.md` between chunks.

### 0d. Display Candidates

```
## Triage Targets (N)

| # | Ticket | Type | Title | Priority | Filed |
|---|--------|------|-------|----------|-------|
```

---

## Phase 1: Investigate Each Target

For each task, in priority order:

### 1a. Read the Task

Call `get_task(id: <uuid>)` to get the full description and any existing comments.

### 1b. Investigate

Based on the task type and description:

**For bugs:**
1. Identify the affected code area from the description
2. Read the relevant files
3. Look for the described symptom in the code
4. Determine if the bug is: confirmed (code is wrong), cannot-reproduce (code looks correct), or needs-info (not enough detail to investigate)
5. If confirmed, identify the root cause and estimate fix scope

**For feature requests/stories:**
1. Identify what the feature requires
2. Check what already exists
3. Estimate scope: small (< 50 lines), medium (50-200), large (200+)
4. Identify dependencies on other work

**For duplicates:**
1. Search for related tasks: `list_tasks(search: "<key terms>")`
2. If a duplicate exists, note the original ticket ID

### 1c. Update the Task

Post findings as a comment:
```
call add_comment(task_id: <uuid>, content: "## Triage Findings\n\n**Status**: confirmed | cannot-reproduce | needs-info | duplicate\n**Root cause**: <if confirmed>\n**Affected files**: <file paths>\n**Fix scope**: small | medium | large\n**Notes**: <additional context>")
```

If the investigation suggests a different priority or complexity, update:
```
call update_task(id: <uuid>, priority: "<new priority>", complexity: "<new complexity>")
```

### 1d. Handle Duplicates

If a task is a duplicate:
```
call add_comment(task_id: <uuid>, content: "Duplicate of TASK-N. Same root cause: <description>.")
call close_task(id: <uuid>)
```

### 1e. Handle Needs-Info

If the task lacks enough detail to investigate:
```
call ask_question(question: "TASK-N (<title>) doesn't have enough detail to investigate. Can you provide: <specific missing info>?", context: "{\"task_id\": \"<ticket-id>\"}")
```

---

## Phase 2: Triage Summary

After investigating all candidates, produce a summary:

```
## Triage Summary

### Investigated: N tasks

| Ticket | Verdict | Priority Change | Fix Scope |
|--------|---------|-----------------|-----------|
| TASK-N | confirmed | medium -> high | small |
| TASK-N | duplicate of TASK-M | — | — |
| TASK-N | needs-info | — | — |

### Quick Wins (confirmed + small scope)
- TASK-N: <title> — <1-line root cause>

### Needs Attention (confirmed + large scope)
- TASK-N: <title> — <1-line root cause>

### Closed as Duplicates: N
### Awaiting Info: N
```

---

## Guidelines

1. **Read before judging.** Always read the actual code before marking a bug as confirmed or cannot-reproduce. Don't guess from the description.
2. **Root cause over symptom.** A triage comment should explain WHY the bug happens, not just confirm it exists.
3. **File paths are mandatory.** Every confirmed finding must reference the affected file(s).
4. **Duplicates save time.** Actively look for duplicates — multiple bugs with the same root cause are common after dogfooding sessions.
5. **Priority adjustments are proposals.** Update the task, but note in the comment why you changed priority. The human may disagree.
6. **Batch-safety at 12.** If triaging more than 12 items, write intermediate results between chunks.

## See Also

- `/seam` — Join and orient in a session (prerequisite)
- `/seam-drive` — Implement fixes for triaged bugs
- `/seam-review` — Code review (different purpose: reviewing changes, not investigating bugs)
