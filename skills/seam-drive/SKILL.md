---
name: seam-drive
description: "Sustained autonomous implementation against a Seam session backlog. Claims tasks, implements vertical slices, commits with SHA traceability, files bugs, asks blocking questions, and posts retro to session notes. The Seam task board IS the plan. Keywords: seam, drive, autonomous, implement, backlog, sprint, agent."
argument-hint: "<agent-code or 'resume'>"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, mcp__seam__join_session, mcp__seam__get_session, mcp__seam__my_info, mcp__seam__create_task, mcp__seam__list_tasks, mcp__seam__get_task, mcp__seam__update_task, mcp__seam__add_comment, mcp__seam__close_task, mcp__seam__claim_task, mcp__seam__add_dependency, mcp__seam__remove_dependency, mcp__seam__ask_question, mcp__seam__check_answer, mcp__seam__cancel_question, mcp__seam__list_questions, mcp__seam__list_activity, mcp__seam__get_note, mcp__seam__update_note
context: inline
---

# Seam-Drive: Autonomous Implementation Against a Seam Backlog

You are running **Seam-Drive** — a sustained autonomous implementation loop where the Seam task board is your plan document. You pick up tasks from the session backlog, implement them as vertical slices, commit with traceability, and keep going until the backlog is clear or the user stops you. Input: **$ARGUMENTS**

## When to Use

- When a Seam session has a populated backlog of tasks ready for implementation
- When the user wants an agent to autonomously work through the task board
- When human + agent are collaborating in real-time and the agent should pick up available work
- After `/seam-plan` has decomposed a goal into a Seam task hierarchy

## Don't Use When

- The session has no tasks yet — run `/seam-plan` first
- You need to explore or research before implementing — use `/seam` or `/blossom`
- The tasks require human design decisions that haven't been made — too many questions will stall the loop

## Overview

```
Join/reconnect to session
  -> Assess backlog: what's open, what's ready, what's blocked
    -> Select next task batch (3-5 by priority + dependencies)
      -> For each task: claim -> plan -> implement -> commit -> close
        -> File bugs for issues encountered
          -> Ask questions only when truly blocked
            -> Post retro to session notes
              -> Loop back to assess (or stop)
```

---

## Phase 0: Connect and Orient

### 0a. Session Connection

If `$ARGUMENTS` contains an 8-character code, join the session:
```
call join_session(code: <code>, display_name: "Drive Agent")
```

If `$ARGUMENTS` is `resume` or empty, check for an existing session:
```
call my_info()
```

If not in a session, ask for an agent code. Do not proceed without a session.

### 0b. Assess the Backlog

List all tasks:
```
call list_tasks()
```

Build a mental model:
- **Ready**: open tasks with no blocking dependencies and no assignee
- **In-progress**: tasks already claimed (check if any are yours from a prior run)
- **Blocked**: tasks with unresolved dependencies or pending questions
- **Done/Closed**: completed work

Report the assessment:
```
## Seam-Drive: Session <code> | Project: <name>

### Backlog Assessment
- Ready to work: N tasks
- In progress: N tasks (M assigned to me)
- Blocked: N tasks
- Completed: N tasks

### Priority Queue (next 5)
1. TASK-N: <title> (priority: <p>, type: <t>)
2. ...
```

### 0c. Check for In-Progress Work

If any tasks are assigned to you and in_progress, **resume those first** before picking up new work. Check the comments for where you left off.

### 0d. Write Drive State

Write initial state to `memory/scratch/seam-drive-state.md`:

```markdown
# Seam-Drive State

**Session**: <code>
**Project**: <name>
**Started**: <date>
**Cycle count**: 0

## Completed This Session
(none yet)

## Current Focus
(not yet selected)

## Bugs Filed
(none yet)

## Questions Asked
(none yet)
```

---

## Phase 1: Select Task Batch

From the ready tasks, select 3-5 for the current cycle. Prioritize by:

1. **Dependencies**: Tasks that unblock other tasks
2. **Priority**: Critical > High > Medium > Low
3. **Type**: Bugs before features (bugs block users; features add value)
4. **Vertical slice readiness**: Prefer tasks that can be completed end-to-end in one pass

Do not select tasks that:
- Have unresolved dependencies (blocked)
- Are assigned to someone else (respect claims)
- Require human decisions not yet made (check for pending questions)

---

## Phase 2: Execute Task

For each task in the batch, run this loop:

### 2a. Claim

```
call claim_task(id: <uuid>)
call update_task(id: <uuid>, status: "in_progress")
```

### 2b. Plan and Comment

Read the task description. Analyze the codebase to understand what needs to change. Then comment your approach:

```
call add_comment(task_id: <uuid>, content: "Starting implementation. Plan:\n1. <step 1>\n2. <step 2>\n3. <step 3>")
```

This comment serves two purposes:
- The human can see what you're about to do in real time
- If context compacts, the comment preserves your plan

### 2c. Implement

Implement the task as a **vertical slice** — every layer needed for the feature to work end-to-end:

1. Database migration (if needed)
2. Backend API/logic
3. MCP tools (if applicable)
4. Frontend UI (if applicable)
5. Tests (if the project has a test framework)

Use the appropriate tools for the project. Read existing code first to match patterns and conventions.

**Quality checks during implementation:**
- Does it compile/build? Run the project's build command.
- Does it match existing code style? Read adjacent files for patterns.
- Are there edge cases? Handle the obvious ones; comment TODOs for non-obvious ones.

### 2d. Commit

```bash
git add <specific files>
git commit -m "<conventional commit message>"
```

Get the commit SHA:
```bash
git rev-parse --short HEAD
```

### 2e. Close with SHA

```
call add_comment(task_id: <uuid>, content: "Implemented in <sha>. <brief summary of what changed>.")
call close_task(id: <uuid>, commit_sha: "<full sha>")
```

### 2f. Handle Failures

If implementation hits a blocker:

**If it's a codebase issue (bug in existing code, missing dependency):**
```
call create_task(task_type: "bug", title: "<description of issue>", description: "<what you found, where, and why it matters>")
call add_comment(task_id: <original_task_uuid>, content: "Blocked by <bug ticket>: <brief description>. Filed as a bug.")
```
If you can work around the bug, do so and note the workaround. If not, move to the next task.

**If it's a decision that only a human can make:**
```
call ask_question(question: "<specific question>", context: "{\"task_id\": \"<ticket-id>\"}", expires_in_seconds: 900)
```
Move to the next task while waiting. Check for answers between tasks:
```
call check_answer(id: <question_uuid>)
```

**If it's a tool/infrastructure issue (build failure, server won't start):**
Comment on the task with the error, skip it, and move to the next task. Don't burn cycles retrying infrastructure problems.

---

## Phase 3: Between-Task Checks

After completing each task and before starting the next:

1. **Check git status**: Make sure there's no uncommitted work.
   ```bash
   git status --short
   ```

2. **Check for answers**: If you have pending questions, check them:
   ```
   call list_questions(status: "pending")
   ```
   For each question you asked, call `check_answer`. If answered, resume the blocked task.

3. **Check the backlog**: The human may have added or reprioritized tasks since you started:
   ```
   call list_tasks(status: "open")
   ```
   If new high-priority tasks appeared, consider pulling them into the current cycle.

4. **Commit check**: If 3+ tasks have been completed since the last commit, something is wrong — you should be committing per task. Review and fix.

---

## Phase 4: Cycle Retro

After completing the batch (or after the user stops you), write a retro:

### 4a. Summarize the Cycle

```
call list_activity(limit: 50)
```

Review what was accomplished. Build a cycle summary:

```markdown
## Seam-Drive Cycle N Summary

### Completed
- TASK-N: <title> (commit: <sha>)
- TASK-N: <title> (commit: <sha>)

### Bugs Filed
- TASK-N: <title>

### Questions Asked
- Q-N: <question> — answered: <yes/no>

### Blocked/Deferred
- TASK-N: <title> — reason: <why>

### Observations
- <anything notable about the codebase, patterns, or workflow>
```

### 4b. Post to Session Notes

```
call update_note(slug: "drive-retro", title: "Drive Session Retro", content: "<retro markdown>")
```

### 4c. Update Drive State

Update `memory/scratch/seam-drive-state.md` with completed tasks, bugs filed, and questions asked. Increment cycle count.

---

## Phase 5: Loop or Stop

### Check Completion

```
call list_tasks(status: "open")
```

**If open tasks remain that are ready to work**: Return to Phase 1. Select the next batch.

**If all open tasks are blocked**: Report what's blocking and what questions need answers. Ask the human if they want to unblock anything or stop.

**If the backlog is clear**: Announce completion:

```
## Seam-Drive Complete

**Session**: <code>
**Cycles**: N
**Tasks completed**: N
**Bugs filed**: N
**Commits**: N

### What was built
<1-paragraph summary>

### Remaining items
<any deferred or blocked tasks>
```

Post the completion summary to session notes.

**If the user stops you**: Gracefully halt after the current task. Update drive state. Post a partial retro to session notes. Any in-progress tasks get a comment: "Drive session paused. Work in progress — will resume on next `/seam-drive resume`."

---

## Resume Mode

When `$ARGUMENTS` starts with `resume`:

1. Check for active session via `my_info`
2. Read `memory/scratch/seam-drive-state.md` for prior state
3. Check for in-progress tasks assigned to you
4. Report what cycles completed and what remains
5. Resume from Phase 1 (select next batch)

If no drive state file exists but you're in a session, treat it as a fresh start with existing backlog awareness.

---

## Guidelines

1. **The backlog is the plan.** Don't create a separate plan document. The Seam task board is the single source of truth for what needs to be done.
2. **Claim before you start.** Always `claim_task` before implementing. This prevents duplicate work when multiple agents are in the session.
3. **Comment at phase boundaries.** Comment when: starting (your plan), hitting a blocker, finding a bug, and completing (commit SHA). Don't comment for every line of code.
4. **Commit per task.** Each task gets its own commit. Don't batch multiple tasks into one commit — it breaks SHA traceability.
5. **File bugs immediately.** When you hit a platform issue, file it as a bug task right away. Don't batch bugs for the retro.
6. **Questions are for blocking decisions.** Don't ask questions you can answer by reading code. Don't ask FYI questions — use comments.
7. **Respect other claims.** If a task is assigned to someone else, don't touch it. Find a different task.
8. **Vertical slices always.** Every task should produce a deployable increment. Don't implement half a feature across multiple tasks — implement the thin version of the full feature.
9. **Check for new work between tasks.** The human may add or reprioritize tasks while you work. A quick `list_tasks` between tasks keeps you aligned.
10. **Drive state is your lifeline.** Update `memory/scratch/seam-drive-state.md` after every cycle. If context compacts, this file plus the Seam task board let you resume cleanly.

## See Also

- `/seam` — Join and orient in a session (prerequisite)
- `/seam-plan` — Decompose a goal into a task hierarchy before driving
- `/seam-standup` — Summarize progress after a drive cycle
- `/seam-review` — Review changes made during a drive cycle
