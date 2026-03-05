---
name: seam-review
description: "Run a structured code review and post findings to relevant Seam tasks. Reviews commit ranges or recent changes, posts findings as task comments, files new bugs for issues, and posts summary to session notes. Keywords: seam, review, code review, findings, bugs, quality."
argument-hint: "<commit range | 'latest' | TASK-N>"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Agent, Bash(git:*), mcp__seam__my_info, mcp__seam__list_tasks, mcp__seam__get_task, mcp__seam__add_comment, mcp__seam__create_task, mcp__seam__close_task, mcp__seam__update_task, mcp__seam__get_note, mcp__seam__update_note
context: inline
---

# Seam-Review: Code Review with Seam Task Integration

You are running **Seam-Review** — a structured code review that posts findings back to the Seam session. Each finding gets attached to the relevant task as a comment, new bugs get filed for issues without existing tickets, and a review summary goes to session notes. Target: **$ARGUMENTS**

## When to Use

- After an agent completes a `/seam-drive` cycle and you want to review its work
- When a human wants the agent to review recent commits
- Before closing an epic to verify all stories were implemented correctly
- When reviewing a specific task's implementation

## Overview

```
Verify session + determine review scope
  -> Gather changes (git diff/log)
    -> Review across 5 dimensions
      -> Map findings to Seam tasks
        -> Post findings as comments + file new bugs
          -> Post review summary to session notes
```

---

## Phase 0: Determine Scope

### 0a. Verify Session

Call `my_info()` to confirm active session.

### 0b. Parse Review Target

| Argument | Scope |
|---|---|
| `latest` or empty | Last commit: `git diff HEAD~1..HEAD` |
| `HEAD~N..HEAD` | Commit range |
| `<sha>..<sha>` | Specific range |
| `TASK-N` | Find commits linked to that task (search comments for commit SHAs) |
| `all` | All uncommitted changes: `git diff` |

### 0c. Load the Changes

```bash
git log --oneline <range>
git diff --stat <range>
git diff <range>
```

If the diff is large (> 500 lines), chunk by file and review each file separately.

---

## Phase 1: Review

Review the changes across 5 dimensions. For each, produce findings with severity:

### Correctness
- Does the code do what the task description says it should?
- Are there logic errors, off-by-one mistakes, or missing edge cases?
- Do database migrations match the code that queries them?

### Security
- SQL injection, XSS, CSRF, auth bypass, secret leakage
- Are user inputs validated at system boundaries?
- Do new endpoints require authentication?

### Style & Consistency
- Does the code match the project's existing patterns?
- Naming conventions, file placement, import ordering
- Are there dead code, TODOs, or debugging artifacts left in?

### Architecture
- Does the change fit the project's structure?
- Are there circular dependencies or layering violations?
- Would this change make future work harder?

### Testing
- Are there tests for the new behavior?
- Do existing tests still pass conceptually (no broken assumptions)?
- Are edge cases covered?

---

## Phase 2: Map Findings to Tasks

### 2a. Load Task Context

Call `list_tasks()` to get all tasks. For each commit in the range, search task comments for the commit SHA to find the associated task.

### 2b. Categorize Findings

For each finding:
- **Has a task**: Post as a comment on that task
- **No task but related to existing work**: Post on the most relevant task
- **New issue**: File as a bug

### 2c. Severity

- **CRITICAL**: Will cause runtime failures, security vulnerabilities, or data loss. Must fix before shipping.
- **SERIOUS**: Will cause bugs, confusing behavior, or maintenance problems. Should fix.
- **ADVISORY**: Style, minor improvements, or observations. Track but don't block.

---

## Phase 3: Post Findings

### For findings with an associated task:

```
call add_comment(task_id: <uuid>, content: "## Code Review Finding\n\n**Severity**: CRITICAL | SERIOUS | ADVISORY\n**Dimension**: correctness | security | style | architecture | testing\n**File**: <path:line>\n**Finding**: <description>\n**Suggestion**: <proposed fix>")
```

### For new bugs:

```
call create_task(task_type: "bug", title: "Review: <brief description>", description: "Found during code review of <range>.\n\n**File**: <path:line>\n**Finding**: <description>\n**Severity**: <level>\n**Suggestion**: <proposed fix>", priority: "<based on severity>")
```

### Review summary to session notes:

```
call update_note(slug: "review", title: "Code Review: <range>", content: "<summary markdown>")
```

Summary format:
```markdown
# Code Review: <range>

**Commits reviewed**: N
**Files changed**: N
**Findings**: N (C critical, S serious, A advisory)

## Critical Findings
- TASK-N: <finding> (file:line)

## Serious Findings
- TASK-N: <finding> (file:line)

## Advisory
- <finding> (file:line)

## Overall Assessment
<1-paragraph assessment of code quality and readiness>
```

---

## Guidelines

1. **Review what changed, not everything.** Focus on the diff, not the entire file. Existing issues in unchanged code are out of scope unless they're made worse by the change.
2. **Be specific.** "This could be better" is not a finding. "Line 42: SQL query interpolates user input without parameterization" is.
3. **Propose fixes.** Every CRITICAL and SERIOUS finding should include a suggestion for how to fix it.
4. **Map to tasks.** The value of Seam-review over plain `/review` is task traceability. Every finding should be attached to a task or filed as a new bug.
5. **Don't flood.** Group related findings. If the same pattern appears in 5 files, post one finding with all 5 file references, not 5 separate findings.

## See Also

- `/seam-drive` — What you're typically reviewing the output of
- `/seam-triage` — For investigating bugs (not reviewing changes)
- `/seam-standup` — For summarizing progress (not reviewing quality)
