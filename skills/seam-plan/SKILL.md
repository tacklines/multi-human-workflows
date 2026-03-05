---
name: seam-plan
description: "Decompose a goal into a structured Seam task hierarchy (epic/stories/tasks) with dependencies. Explores the codebase, identifies work needed, creates all items in the Seam session, and posts the plan as a shared note. Keywords: seam, plan, decompose, epic, backlog, tasks, goal."
argument-hint: "<goal description>"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Agent, Bash(git:*), mcp__seam__join_session, mcp__seam__get_session, mcp__seam__my_info, mcp__seam__create_task, mcp__seam__list_tasks, mcp__seam__get_task, mcp__seam__update_task, mcp__seam__add_comment, mcp__seam__close_task, mcp__seam__add_dependency, mcp__seam__ask_question, mcp__seam__check_answer, mcp__seam__get_note, mcp__seam__update_note
context: inline
---

# Seam-Plan: Decompose Goal into Seam Task Hierarchy

You are running **Seam-Plan** — the planning skill that takes a goal, explores the codebase to understand what exists, decomposes the work into an epic/story/task hierarchy, and creates everything in the Seam session. The task board IS the plan. Goal: **$ARGUMENTS**

## When to Use

- When a human gives a loose goal ("we need projects as a top-level grouping") and you need to structure it into actionable work
- Before running `/seam-drive` — to populate the backlog it will execute against
- When starting a new feature epic in a Seam session
- When the session task board is empty or needs a new body of work

## Don't Use When

- The backlog is already populated with well-defined tasks — just run `/seam-drive`
- The goal is a single task that doesn't need decomposition — use `/seam create task <title>`
- You need deep research before planning — run `/blossom` or `/gather` first, then pipe findings into `/seam-plan`

## Overview

```
Verify session + parse goal
  -> Explore codebase (fan-out 3 agents)
    -> Synthesize findings into work breakdown
      -> Create epic + stories + tasks in Seam with dependencies
        -> Post plan summary as session shared note
          -> Optionally ask human to review before proceeding
```

---

## Phase 0: Gate

### 0a. Verify Session

Call `my_info()` to confirm you're in a Seam session. If not, ask for an agent code and join first.

### 0b. Parse Goal

If `$ARGUMENTS` is empty, ask:
> "What's the goal? Give me a sentence or two about what needs to be built."

Extract from the goal:
- **What**: the feature or change being requested
- **Why**: the motivation (if stated)
- **Constraints**: any technology, scope, or design constraints mentioned

### 0c. Check Existing Work

Call `list_tasks()` and scan for epics or stories that overlap with this goal. If overlap exists, report it:
> "Found existing epic TASK-N: '<title>' which may overlap with this goal. Should I extend it or create a new epic?"

---

## Phase 1: Explore

Dispatch 3 Explore agents concurrently to understand the current codebase state relative to the goal.

### Agent 1: Current State Mapper

> You are analyzing a codebase to understand what currently exists for a planned feature.
>
> **Goal**: {goal}
>
> Find and report:
> 1. What parts of the goal already exist (partially or fully implemented)
> 2. What data models, API endpoints, and UI components are relevant
> 3. What patterns and conventions the codebase uses (frameworks, file structure, naming)
> 4. What infrastructure exists (database, auth, real-time, etc.)
>
> Be concrete: cite file paths, function names, and database tables. Distinguish between CONFIRMED (verified by reading code), LIKELY (strong evidence), and POSSIBLE (inferred from patterns).

### Agent 2: Gap Analyzer

> You are analyzing a codebase to identify what needs to be built for a planned feature.
>
> **Goal**: {goal}
>
> Find and report:
> 1. What's missing — features, endpoints, tables, components that the goal requires but don't exist yet
> 2. What needs modification — existing code that works but needs changes to support the goal
> 3. What integration points exist — where the new feature touches existing features
> 4. What risks exist — complex areas, technical debt, or fragile code near the change surface
>
> For each gap, estimate the scope: small (< 50 lines), medium (50-200 lines), or large (200+ lines).

### Agent 3: Pattern and Constraint Discoverer

> You are analyzing a codebase to understand the patterns and constraints that apply to a planned feature.
>
> **Goal**: {goal}
>
> Find and report:
> 1. What vertical slice pattern the project uses (migration -> API -> MCP -> frontend -> commit?)
> 2. What test patterns exist (if any)
> 3. What naming conventions apply (file names, route paths, component names)
> 4. What existing features are similar to the goal — these are the templates to follow
> 5. What dependencies or ordering constraints exist (e.g., "must add DB table before API route")

Launch all 3 with `run_in_background: true`. Wait for all to complete.

---

## Phase 2: Synthesize into Work Breakdown

Merge the three agents' findings into a structured work breakdown.

### 2a. Identify Stories

Group the gaps and required changes into **stories** — each story is a user-visible capability or a distinct technical concern:

- Each story should be a vertical slice (deliverable end-to-end)
- Each story should be implementable independently (after its dependencies)
- Each story should take 30-90 minutes of agent work
- Aim for 4-8 stories per epic (less for simple goals, more for complex ones)

### 2b. Identify Dependencies

Determine ordering constraints between stories:
- Does story B require a database table that story A creates?
- Does story C consume an API endpoint that story B builds?
- Is there a clear "foundation first, features second" ordering?

Build a dependency graph. Check for cycles (there shouldn't be any).

### 2c. Assign Priority

Rank stories by implementation order:
- **Critical**: Foundation work that everything else depends on
- **High**: Core user-facing features
- **Medium**: Enhancement and quality features
- **Low**: Nice-to-haves and polish

### 2d. Break Stories into Tasks (if needed)

For large stories (3+ distinct code changes), break them into tasks:
- Each task = one focused code change
- Tasks within a story share the story's priority
- Tasks inherit the story's dependencies

For small stories, don't create subtasks — the story IS the task.

---

## Phase 3: Create in Seam

### 3a. Create the Epic

```
call create_task(task_type: "epic", title: "<goal as a concise title>", description: "<what and why, including key decisions from the exploration>", priority: "<priority>")
```

Save the epic UUID and ticket ID.

### 3b. Create Stories

For each story:
```
call create_task(task_type: "story", title: "<story title>", description: "<what this story delivers, including file paths and patterns to follow>", parent_id: "<epic uuid>", priority: "<priority>", complexity: "<small|medium|large>")
```

Save each story's UUID and ticket ID.

### 3c. Create Tasks (for large stories)

For each task under a large story:
```
call create_task(task_type: "task", title: "<task title>", description: "<specific change needed>", parent_id: "<story uuid>", priority: "<priority>")
```

### 3d. Set Dependencies

For each dependency relationship:
```
call add_dependency(blocker_id: "<uuid of blocking task>", blocked_id: "<uuid of blocked task>")
```

### 3e. Verify

Call `list_tasks(parent_id: "<epic uuid>")` to confirm all children were created. Report any that failed.

---

## Phase 4: Post Plan Summary

Create a shared note with the plan:

```
call update_note(slug: "plan", title: "Plan: <goal>", content: "<plan markdown>")
```

The plan note should include:

```markdown
# Plan: <goal>

## Epic: TASK-N — <title>

### Stories (N total)

1. **TASK-N: <title>** (priority: <p>, complexity: <c>)
   - <what it delivers>
   - depends on: TASK-N (if any)

2. **TASK-N: <title>** ...

### Dependency Graph

```
TASK-A (foundation)
  +-- TASK-B (depends on A)
  |   +-- TASK-D (depends on B)
  +-- TASK-C (depends on A)
```

### Key Decisions
- <decision 1 from exploration>
- <decision 2>

### Open Questions
- <question 1 — needs human input>
```

---

## Phase 5: Review Gate (Optional)

If the plan has open questions or the goal was ambiguous, ask the human to review:

```
call ask_question(question: "I've created an epic with N stories for '<goal>'. The plan is posted in the shared notes (slug: plan). Anything you'd like to change before I start implementing?", expires_in_seconds: 1800)
```

If the human answers with changes, update the tasks accordingly.

If no open questions and the goal was clear, skip this gate and suggest:
> "Plan created: TASK-N with N stories. Run `/seam-drive` to start implementing, or review the plan in session notes (slug: plan)."

---

## Guidelines

1. **Explore before planning.** Don't decompose from the goal description alone. Read the actual codebase to understand what exists, what's missing, and what patterns to follow.
2. **Vertical slices.** Every story should produce something deployable. "Add database tables" is not a story — "Add project CRUD (table + API + UI)" is.
3. **Right-size stories.** Too big: the agent will lose context mid-task. Too small: overhead of claiming/closing/commenting dominates actual work. Target 30-90 minutes of agent work per story.
4. **Dependencies are ordering, not blocking.** A dependency means "do this first." It doesn't mean the blocked task can't be worked on until the blocker is *closed* — just that it shouldn't start until the blocker is *done*.
5. **Description quality matters.** Task descriptions are what `/seam-drive` reads to understand the work. Include: what changes, which files/patterns to follow, what the done state looks like.
6. **Don't over-plan.** If the goal is simple (3 or fewer stories), skip the subtask breakdown. If the goal is complex, plan the first 5-6 stories in detail and leave later ones as story-level only.
7. **Post the plan as a note.** The session note makes the plan visible to humans who aren't watching the task board in real time. It's also the recovery artifact if the session is long.
8. **Ask, don't assume.** If the exploration reveals ambiguity in the goal (e.g., "should this be admin-only or available to all users?"), ask the human rather than making the decision yourself.

## See Also

- `/seam` — Join and orient in a session (prerequisite)
- `/seam-drive` — Execute against the plan this skill creates
- `/seam-triage` — For investigating existing bugs before planning new work
