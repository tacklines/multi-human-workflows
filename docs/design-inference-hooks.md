# Design: Inference Hooks & Dispatch Patterns

**Status**: Draft
**Date**: 2026-03-06

## Problem

Seam has a rich domain model (tasks, requirements, requests, sessions, invocations, knowledge) and a working event-reaction-scheduler system. But inference opportunities are underexploited: most AI involvement requires explicit human dispatch ("launch an agent to do X"). We want to identify every point where inference could add value automatically, expose hooks in our models for it, and structure dispatch patterns that make it easy to wire up.

## What We Have Today

### Event System
| Component | Status |
|---|---|
| Domain events (15 types, 5 aggregates) | Built |
| Event bridge (PG → RabbitMQ) | Built |
| Reaction engine (event → action) | Built |
| Cron scheduler | Built |
| Action types: invoke_agent, webhook, mcp_tool | Built |

### Inference Surfaces
| Surface | Status |
|---|---|
| Request → blossom decomposition | Designed (design-requirements-flow.md), partially wired |
| Agent invocations (explicit) | Built |
| Knowledge indexing pipeline | Built |
| Model routing (multi-provider) | Built |

### Agent System (Python)
| Component | Status |
|---|---|
| 5 prompt-based skills (triage, decompose, summarize, research, blossom) | Built |
| 6 workflow primitives (gather, distill, rank, critique, decompose, verify) | Built |
| 4 canonical pipelines (research, analysis, planning, verification) | Built |
| Model router (7 capabilities, 4 budget tiers, 20+ profiles) | Built |
| MCP client (41 tools from server) | Built |

### Key Gap
The dispatch system is fully capable but **undersubscribed**. Only `request.created` has a designed reaction. The other 14 event types have no inference reactions. Scheduled jobs exist but have no pre-configured inference patterns.

The Python agent system has composable primitives (gather, distill, rank) that could power medium-weight inference, but these are only accessible via full `invoke_agent` dispatch today. For lightweight hooks (classification, enrichment), we need a server-side inference path that avoids Coder workspace overhead.

---

## Inference Hook Taxonomy

Every hook has a **trigger** (what fires it), a **scope** (what data it operates on), and an **action** (what inference it performs). Hooks are classified by weight:

| Weight | Latency | Cost | Example |
|---|---|---|---|
| **Lightweight** | <2s | Cheap model or no LLM | Field suggestion, validation, classification |
| **Medium** | 5-30s | Standard model call | Summarization, analysis, triage |
| **Heavyweight** | 1-10min | Full agent invocation | Decomposition, implementation, review |

---

## Hook Catalog by Aggregate

### 1. Tasks

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Auto-triage** | `task.created` | Medium | Classify priority, complexity, type if not set. Suggest assignee based on skills/history. |
| **Description enrichment** | `task.created` | Medium | If description is sparse, expand with acceptance criteria, technical notes from related tasks/requirements. |
| **Dependency suggestion** | `task.created` | Medium | Analyze task against open tasks, suggest blocking/blocked-by relationships. |
| **Completion summary** | `task.closed` | Medium | Generate a summary of what was done (from comments, commits). Write to a `completion_summary` field. |
| **Stale task detection** | Scheduled (daily) | Medium | Find in_progress tasks with no activity for N days. Ping assignee or escalate. |
| **Sprint readiness** | Scheduled (weekly) | Medium | Score backlog tasks by readiness (dependencies met, description quality, estimates). |
| **Task clustering** | `task.created` (batched) | Medium | Group related tasks, suggest parent epics or stories. |
| **Requirement satisfaction check** | `task.closed` | Lightweight | Check if all tasks linked to a requirement are done → suggest transitioning requirement to satisfied. |

#### Model Hooks on Task
```
tasks:
  on_create:
    - auto_triage (priority, complexity, type inference)
    - description_enrichment (expand sparse descriptions)
    - dependency_suggestion (analyze against open tasks)
  on_close:
    - completion_summary (synthesize comments + commits)
    - requirement_satisfaction_check (auto-progress requirements)
  on_stale:                    # scheduled
    - stale_detection (flag tasks with no recent activity)
```

### 2. Requests

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Request analysis** | `request.created` | Heavyweight | Decompose into requirements + tasks (existing design). |
| **Duplicate detection** | `request.created` | Medium | Compare against existing requests + requirements. Flag overlaps. |
| **Impact analysis** | `request.created` | Medium | Estimate scope, affected components, risk. Write to analysis field. |
| **Re-analysis** | `request.updated` (body changed) | Heavyweight | If body changes significantly, re-run decomposition. |

#### Model Hooks on Request
```
requests:
  on_create:
    - duplicate_detection (compare against existing)
    - impact_analysis (scope, components, risk)
    - decomposition (requirements + tasks) [heavyweight, async]
  on_update:
    - re_analysis (if body changed significantly)
```

### 3. Requirements

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Task generation** | Requirement status → `active` | Heavyweight | When a requirement becomes active, generate implementation tasks if none linked. |
| **Coverage analysis** | Scheduled (weekly) | Medium | For each active requirement, assess task coverage — are there gaps? |
| **Conflict detection** | `requirement.created` | Medium | Check if new requirement conflicts with existing ones. |

#### Model Hooks on Requirement
```
requirements:
  on_activate:
    - task_generation (create implementation tasks)
  on_create:
    - conflict_detection (check against existing)
  scheduled:
    - coverage_analysis (weekly gap check)
```

### 4. Sessions

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Session summary** | Session closed / scheduled (end of day) | Medium | Summarize what happened: tasks created, decisions made, questions asked. |
| **Context briefing** | `session.participant_joined` (agent) | Medium | When an agent joins, generate a context briefing from recent activity, open tasks, pending questions. |
| **Meeting notes** | Scheduled (after session idle 30min) | Medium | Generate structured notes from session activity. |

#### Model Hooks on Session
```
sessions:
  on_agent_join:
    - context_briefing (summarize recent activity for the joining agent)
  on_close:
    - session_summary (what happened, decisions, outcomes)
  on_idle:                     # scheduled
    - meeting_notes (structured notes from activity)
```

### 5. Comments

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Sentiment/intent classification** | `comment.added` | Lightweight | Classify: question, decision, blocker, status update, code reference. |
| **Question extraction** | `comment.added` | Lightweight | If comment contains a question, auto-create a pending question entity. |
| **Action item extraction** | `comment.added` | Medium | Extract "someone should..." or "TODO:" patterns → suggest tasks. |

#### Model Hooks on Comment
```
comments:
  on_add:
    - intent_classification (question, decision, blocker, etc.)
    - question_extraction (auto-create question entities)
    - action_item_extraction (suggest tasks from TODOs)
```

### 6. Invocations

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Result extraction** | `invocation.completed` | Medium | Parse agent output for structured results (tasks created, files changed, decisions made). |
| **Failure analysis** | `invocation.failed` | Medium | Analyze why the invocation failed. Suggest retry with different parameters or model. |
| **Cost alerting** | `invocation.completed` | Lightweight | If cost exceeds budget tier threshold, notify. |

#### Model Hooks on Invocation
```
invocations:
  on_complete:
    - result_extraction (structured summary of agent output)
    - cost_alerting (budget threshold check)
  on_fail:
    - failure_analysis (diagnose + suggest retry)
```

### 7. Knowledge (Cross-Cutting)

| Hook | Trigger | Weight | Description |
|---|---|---|---|
| **Project health report** | Scheduled (weekly) | Heavyweight | Synthesize: task velocity, requirement coverage, open blockers, stale items. |
| **Trend analysis** | Scheduled (weekly) | Medium | Compare this week's metrics to last. Flag anomalies. |
| **Onboarding digest** | On demand / new member join | Medium | Generate project overview from requirements, recent activity, architecture. |

---

## New Action Type: `inference`

The current `invoke_agent` action is heavyweight — it spins up a Coder workspace, runs `claude -p`, captures output. This is appropriate for decomposition and implementation but overkill for triage, classification, and summarization.

**Proposal: Add a lightweight `inference` action type** that runs a model call inline in the worker process:

```rust
// New action type in actions.rs
pub struct InferenceConfig {
    /// System prompt for the inference call
    pub system_prompt: String,
    /// User prompt template (supports {{key}} interpolation)
    pub prompt: String,
    /// Which model to use (defaults to project/org preference)
    pub model: Option<String>,
    /// Budget tier constraint
    pub budget_tier: Option<String>,
    /// Where to write the result
    pub result_target: ResultTarget,
}

pub enum ResultTarget {
    /// Write to a field on the aggregate that triggered the event
    UpdateField { field: String },
    /// Create a comment on the aggregate
    AddComment,
    /// Create a new task
    CreateTask,
    /// Fire a domain event with the result
    EmitEvent { event_type: String },
    /// Just log (for alerting/monitoring)
    LogOnly,
}
```

### Why Not Just `invoke_agent`?

| Dimension | `invoke_agent` | `inference` (proposed) |
|---|---|---|
| Latency | 30s-10min (workspace startup) | 1-10s (direct API call) |
| Cost | High (workspace + model) | Low (model only) |
| Capabilities | Full filesystem, git, tools | Text in, text out |
| Use case | Implementation, complex analysis | Classification, summarization, enrichment |
| Infrastructure | Requires Coder | Model API only |

The lightweight path enables reactions that would be absurd as full invocations: classifying every comment, triaging every task, summarizing every session.

### Worker Integration

The worker already has a dispatch function in `actions.rs`. Adding `inference` follows the same pattern:

```rust
match action_type {
    "invoke_agent" => dispatch_invoke_agent(action_config, ctx).await,
    "webhook" => dispatch_webhook(action_config, ctx).await,
    "mcp_tool" => dispatch_mcp_tool(action_config, ctx).await,
    "inference" => dispatch_inference(pool, action_config, ctx).await,  // NEW
    ...
}
```

`dispatch_inference` would:
1. Deserialize `InferenceConfig`
2. Interpolate prompt template with event payload
3. Call the model API (Anthropic/OpenRouter/Ollama based on config)
4. Write result to the specified `ResultTarget`

---

## Schema Changes for Hook Results

Several hooks write results back to the entities that triggered them. This requires new nullable fields on existing tables.

### Tasks

```sql
ALTER TABLE tasks
    ADD COLUMN ai_triage JSONB,           -- {suggested_priority, suggested_complexity, suggested_assignee, reasoning}
    ADD COLUMN completion_summary TEXT,     -- Generated when task is closed
    ADD COLUMN ai_suggested_deps UUID[];   -- Suggested dependency task IDs
```

### Comments

```sql
ALTER TABLE task_comments
    ADD COLUMN intent TEXT;                -- question, decision, blocker, status_update, code_reference
```

### Invocations

```sql
ALTER TABLE invocations
    ADD COLUMN result_summary TEXT,        -- Extracted summary of what the agent did
    ADD COLUMN failure_analysis TEXT;      -- Why it failed + suggestions
```

### Sessions

```sql
ALTER TABLE sessions
    ADD COLUMN summary TEXT;              -- Session summary (generated on close or idle)
```

---

## Dispatch Patterns

### Pattern 1: Event-Driven Lightweight Inference

The bread-and-butter pattern. An event fires, a reaction runs a lightweight inference call, and the result is written back.

```
task.created → reaction (inference) → classify priority/complexity → UPDATE tasks SET ai_triage = ...
```

**Configuration (event_reactions row)**:
```json
{
    "name": "Auto-triage new tasks",
    "event_type": "task.created",
    "aggregate_type": "task",
    "action_type": "inference",
    "action_config": {
        "system_prompt": "You are a task triage assistant. Given a task title and description, suggest priority (p0-p4), complexity (xs-xl), and task type (task/bug/feature/story).",
        "prompt": "Task: {{title}}\n\nDescription: {{description}}\n\nExisting project context: {{project_context}}",
        "model": "haiku",
        "budget_tier": "low",
        "result_target": { "UpdateField": { "field": "ai_triage" } }
    }
}
```

### Pattern 2: Event-Driven Heavyweight Agent

For complex work that needs tools, filesystem access, or multi-step reasoning.

```
request.created → reaction (invoke_agent) → blossom decomposition → requirements + tasks
```

This already works today. The key improvement is adding more pre-configured reactions.

### Pattern 3: Scheduled Batch Inference

Periodic analysis that operates on aggregate data rather than individual events.

```
cron: 0 18 * * FRI → scheduled_job (inference) → weekly project health report → write to session note
```

**Configuration (scheduled_jobs row)**:
```json
{
    "name": "Weekly project health report",
    "cron_expr": "0 18 * * FRI",
    "action_type": "inference",
    "action_config": {
        "system_prompt": "Generate a project health report from the provided metrics.",
        "prompt": "Generate a weekly health report for this project.",
        "model": "sonnet",
        "budget_tier": "medium",
        "result_target": { "EmitEvent": { "event_type": "report.generated" } }
    }
}
```

### Pattern 4: Chained Reactions

One event's reaction produces another event, which triggers another reaction. This is already supported by the architecture (reactions emit domain events → bridge picks them up → new reactions fire).

```
request.created
  → inference: duplicate detection
    → if novel: invoke_agent: full decomposition
    → if duplicate: inference: write analysis ("duplicates REQ-42")
```

Implementation: The duplicate detection reaction emits a `request.analyzed` event with `{is_duplicate: false}`. A second reaction filters on `request.analyzed` where `is_duplicate = false` and triggers the heavyweight decomposition.

### Pattern 5: Human-in-the-Loop Inference

Inference that produces suggestions rather than taking action. The suggestion appears in the UI for human approval.

```
task.created → inference: suggest dependencies → write to ai_suggested_deps field
→ frontend shows "Suggested dependencies: TASK-12, TASK-45" with accept/dismiss buttons
```

This keeps the human in control while reducing cognitive load. The `ai_*` fields on models are always suggestions, never authoritative.

---

## Frontend Integration Points

### AI Suggestion Chips

Where AI-generated suggestions appear in the UI:

1. **Task detail** — triage suggestions (priority, complexity, type) with accept/dismiss
2. **Task detail** — suggested dependencies with link buttons
3. **Task board** — AI-generated sprint readiness scores
4. **Request detail** — duplicate detection warnings
5. **Requirement tree** — coverage gaps highlighted
6. **Session lobby** — context briefing for joining agents (auto-generated)
7. **Comment thread** — intent badges (question, decision, blocker)

### Automation Settings Panel

Project settings should expose a UI for configuring inference hooks:

- Toggle pre-defined hooks on/off per project
- Adjust model/budget tier per hook
- View hook execution history (last run, result, cost)
- Custom reaction builder (advanced users)

---

## Pre-Configured Hook Bundles

Rather than requiring users to wire individual reactions, offer curated bundles:

### "Task Intelligence" Bundle
- Auto-triage on task.created
- Completion summary on task.closed
- Stale detection (daily)
- Dependency suggestions on task.created

### "Request Pipeline" Bundle
- Duplicate detection on request.created
- Impact analysis on request.created
- Full decomposition on request.created (heavyweight)
- Re-analysis on request.updated

### "Session Awareness" Bundle
- Context briefing on agent join
- Session summary on close/idle
- Comment intent classification

### "Project Health" Bundle
- Weekly health report (scheduled)
- Requirement coverage analysis (scheduled)
- Trend analysis (scheduled)

---

## Implementation Phases

### Phase 1: Inference Action Type
- Add `inference` action type to `actions.rs`
- Model API client in worker (Anthropic SDK, Ollama, OpenRouter)
- ResultTarget: UpdateField, AddComment, LogOnly
- Migration: add `ai_triage`, `completion_summary` to tasks
- **First hook**: Auto-triage on task.created

### Phase 2: Comment & Session Hooks
- Migration: add `intent` to task_comments, `summary` to sessions
- Comment intent classification on comment.added
- Session summary on session idle/close
- Context briefing on agent join

### Phase 3: Request Pipeline Hooks
- Duplicate detection on request.created
- Impact analysis on request.created
- Wire existing blossom decomposition as default reaction
- Re-analysis on request.updated

### Phase 4: Scheduled Analysis
- Weekly project health report
- Stale task detection (daily)
- Requirement coverage analysis
- Sprint readiness scoring

### Phase 5: Frontend Suggestions UI
- AI suggestion chips on task detail
- Automation settings panel in project settings
- Hook execution history view
- Pre-configured bundles UI

### Phase 6: Chained Reactions & Advanced Patterns
- Event filtering improvements (JSON path matching)
- Reaction chaining (output of one → input of next)
- Conditional dispatch (if/else based on inference result)
- Rate limiting and cost controls per project

---

## Open Questions

1. **Inference result storage**: Should `ai_triage` be a JSONB field on the task, or a separate `ai_suggestions` table? JSONB on the model is simpler but creates schema coupling. A suggestions table is more flexible but adds joins.
   - **Lean**: JSONB on the model for v1. Migrate to suggestions table if the pattern proves useful across many aggregates.

2. **Model selection for inference**: Should the worker have its own model preferences, or inherit from the project/org? The worker runs server-side — it doesn't have a user context.
   - **Lean**: Project-level default model for inference, overridable per reaction config.

3. **Cost controls**: How do we prevent runaway inference costs? Every task.created event triggers a model call.
   - **Lean**: Per-project daily inference budget. Worker tracks cumulative cost. Disable reactions when budget exceeded. Alert project admins.

4. **Batch vs. individual**: Some hooks (stale task detection, sprint readiness) need to scan all tasks, not react to individual events. Should these be scheduled jobs or a new "batch inference" action type?
   - **Lean**: Scheduled jobs with an enhanced prompt that includes `mcp_tool` calls to fetch aggregate data. Or add a `batch_inference` action that pre-fetches data before calling the model.

5. **Feedback loop**: When a human dismisses an AI suggestion (e.g., rejects a triage recommendation), should that feed back to improve future suggestions?
   - **Lean**: Not in v1. Track accept/dismiss rates for analysis. Consider fine-tuning or prompt adjustment in v2.

6. **Reuse workflow primitives for inference?** The Python agent system has composable LangGraph primitives (gather, distill, rank, critique). Should the `inference` action type call these via the agent CLI, or should we duplicate the pattern in Rust?
   - **Lean**: Keep them separate. Rust `inference` action is for sub-2s single-call inference (classification, enrichment). Python primitives are for multi-step workflows (10s-60s). The `invoke_agent` action with `--workflow` flag already covers the medium-weight case.

7. **Event filter enhancement**: Current reaction filters only support top-level key equality. Inference hooks need richer filtering (e.g., "only when description is empty", "only when priority is unset").
   - **Lean**: Add JSON path operators for v1 of inference hooks. Minimum: exists, not_exists, equals, not_equals. Defer regex and numeric comparisons.
