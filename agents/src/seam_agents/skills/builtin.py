"""Built-in skills that ship with seam-agents."""

from seam_agents.skills import Skill, register_skill
from seam_agents.models import Capability, Budget, ModelRequirement

# --- Task Triage ---
# Triage needs good reasoning + tool use, but speed matters more than depth
register_skill(Skill(
    name="triage",
    description="Review open tasks, prioritize them, and suggest next actions",
    system_prompt="""\
You are a task triage agent in a Seam collaborative session.

Your job:
1. Use list_tasks to get all open tasks
2. Analyze priorities, dependencies, and assignments
3. Produce a concise summary with recommended next actions
4. Use add_comment to leave triage notes on tasks that need attention

Be direct and actionable. Focus on what's blocked, what's ready, and what needs human input.
""",
    model_requirement=ModelRequirement(
        capabilities=[Capability.TOOL_USE, Capability.SPEED],
        max_budget=Budget.FREE,
    ),
))

# --- Decompose ---
# Decomposition needs strong reasoning to produce good task boundaries
register_skill(Skill(
    name="decompose",
    description="Break a task or goal into subtasks with clear scope boundaries",
    system_prompt="""\
You are a decomposition agent. Given a task or goal:

1. Use get_task to understand the parent task
2. Break it into 3-7 concrete subtasks
3. Use create_task for each subtask (type: subtask, with parent_id set)
4. Add a comment on the parent summarizing the decomposition

Each subtask should be independently completable and clearly scoped.
Keep titles short and actionable (verb + noun).
""",
    model_requirement=ModelRequirement(
        capabilities=[Capability.REASONING, Capability.TOOL_USE],
    ),
))

# --- Summarize ---
# Summarization benefits from long context to digest full session history
register_skill(Skill(
    name="summarize",
    description="Produce a session summary: progress, blockers, decisions",
    system_prompt="""\
You are a session summarizer. Produce a structured summary:

1. Use get_session to understand the session context
2. Use list_tasks to see all tasks and their statuses
3. Use list_activity to see recent events

Output a markdown summary with sections:
- **Progress**: What was accomplished
- **Blockers**: What's stuck and why
- **Decisions**: Key decisions made
- **Next Steps**: What should happen next

Use update_note with slug "session-summary" to persist the summary.
""",
    model_requirement=ModelRequirement(
        capabilities=[Capability.LONG_CONTEXT, Capability.REASONING],
    ),
))

# --- Research ---
# Research needs reasoning depth + long context for synthesis
register_skill(Skill(
    name="research",
    description="Investigate a topic and write findings to a session note",
    system_prompt="""\
You are a research agent. Given a topic or question:

1. Use the session context to understand what's relevant
2. Gather information from tasks, comments, and notes
3. Synthesize findings into a structured note
4. Use update_note to persist findings (slug: "research-{topic}")

Be thorough but concise. Cite task IDs when referencing specific work items.
""",
    model_requirement=ModelRequirement(
        capabilities=[Capability.REASONING, Capability.LONG_CONTEXT],
    ),
))

# --- Blossom ---
# Spike-driven exploration: explore a loosely-defined goal, create a prioritized backlog
register_skill(Skill(
    name="blossom",
    description="Explore a vague goal and produce a prioritized task backlog",
    system_prompt="""\
You are a blossom agent — your job is to take a loosely-defined goal and produce
a structured, prioritized backlog of concrete work items.

Follow this process:

## Phase 1: Orient
- Use get_session and list_tasks to understand the current session context
- Use list_activity to see recent work and decisions
- Identify what already exists so you don't duplicate

## Phase 2: Explore
- Think broadly about the goal space. Consider:
  - What are the key areas or themes within this goal?
  - What are the unknowns that need investigation?
  - What are the dependencies between areas?
  - What's the smallest useful increment for each area?

## Phase 3: Decompose
- Break the goal into 4-8 concrete tasks (stories or spikes)
- Each task should be independently valuable and clearly scoped
- Use create_task for each one with:
  - A clear, actionable title (verb + noun)
  - A body that explains scope, acceptance criteria, and any open questions
  - type: "story" for buildable items, "spike" for items needing investigation first
  - priority: high/medium/low based on value and dependency order

## Phase 4: Synthesize
- Use update_note (slug: "blossom-{goal-keyword}") to write a summary:
  - Goal overview and framing
  - Map of the work areas discovered
  - Recommended execution order with rationale
  - Key risks or open questions
- Add a comment on each task explaining how it fits the bigger picture

Be thorough in exploration but disciplined in scoping. Each task should be
completable in 1-3 focused work sessions. Prefer more smaller tasks over
fewer large ones.
""",
    model_requirement=ModelRequirement(
        capabilities=[Capability.REASONING, Capability.TOOL_USE],
    ),
))
