# Plan: Workflow Engine — Tackline Skills as Native LangGraph Workflows

## Vision

Bring tackline's composable skill/workflow system into Seam's agent framework as first-class LangGraph constructs. Agents gain structured reasoning patterns (gather→rank→sketch, decompose→plan, sprint→retro) that execute as typed state machines rather than prompt bundles.

## Design Principles

1. **Skills are subgraphs, not prompts.** Each skill is a compiled LangGraph StateGraph with typed input/output. Skills compose by wiring subgraphs together.
2. **Pipe-format becomes typed state.** The markdown pipe-format becomes Pydantic models (PipeItem, PipeOutput) that flow between graph nodes with validation.
3. **Start small, grow by need.** Begin with 6 core primitives + pipeline composer. Add workflows and team skills only when the foundation proves solid.
4. **LangGraph-native patterns.** Use subgraph composition, conditional edges, checkpointing, and Store — not ad-hoc orchestration.
5. **Backward compatible.** Existing prompt-based skills (triage, decompose, summarize, research) keep working. New graph-based skills coexist.

## Architecture

```
agents/src/seam_agents/
├── workflows/                    # NEW: workflow engine
│   ├── __init__.py              # Public API
│   ├── state.py                 # Typed state models (PipeItem, PipeOutput, WorkflowState)
│   ├── primitives/              # Core primitive subgraphs
│   │   ├── __init__.py
│   │   ├── gather.py            # Information collection
│   │   ├── distill.py           # Condense to essentials
│   │   ├── rank.py              # Score and order by criteria
│   │   ├── verify.py            # Check claims against evidence
│   │   ├── decompose.py         # Break into bounded sub-parts
│   │   └── critique.py          # Adversarial review
│   ├── composer.py              # Pipeline composition: wire primitives into chains
│   ├── router.py                # Goal→skill/pipeline matching (the /do equivalent)
│   └── memory.py                # LangGraph Store integration for learnings
├── skills/                      # Existing (unchanged)
│   ├── __init__.py
│   └── builtin.py
```

## Deliverables

### Sprint 1: Foundation (state + first primitive + composer)

1. **`state.py`** — Pydantic models for workflow state
   - `PipeItem`: title, detail, source, confidence, scores
   - `PipeOutput`: items list, summary, source skill, pipeline trace
   - `WorkflowState(TypedDict)`: messages, pipe_output, goal, criteria, context

2. **`gather.py`** — First primitive as LangGraph subgraph
   - Nodes: assess_sources → search_code → search_web → synthesize
   - Uses Seam MCP tools + web search
   - Outputs PipeOutput with sourced findings

3. **`composer.py`** — Pipeline wiring
   - `compose(skill_a, skill_b, ...)` → compiled graph that chains subgraphs
   - State mapping between subgraph boundaries
   - Supports linear chains and conditional branching

4. **Integration with session agent** — Register workflow skills alongside existing prompt skills

### Sprint 2: Core primitives

5. **`distill.py`** — Condense PipeOutput to N essential items
6. **`rank.py`** — Score items by criteria, reorder, break ties
7. **`verify.py`** — Check claims against evidence (code, docs, web)
8. **`decompose.py`** — Break goal into bounded sub-parts with interfaces
9. **`critique.py`** — Adversarial review: what's wrong, missing, risky

### Sprint 3: Router + memory

10. **`router.py`** — Goal-directed skill dispatch
    - Reads skill catalog (registered primitives + pipelines)
    - LLM classifies goal → selects skill or pipeline
    - Executes selected workflow

11. **`memory.py`** — Cross-session learnings via LangGraph Store
    - Agent learnings persisted to Store namespaced by agent + session
    - Semantic search for relevant past learnings
    - Retro-style reflection node that writes learnings after workflow completion

### Sprint 4: Canonical pipelines as prebuilt graphs

12. **Research pipeline**: gather → distill → rank
13. **Analysis pipeline**: gather → critique → rank
14. **Planning pipeline**: decompose → rank → plan (sketch)
15. **Exploration pipeline**: gather → verify → distill

## Key Decisions

- **State passing**: Subgraphs read/write `pipe_output` key in shared WorkflowState. Each primitive reads the previous output and writes its own.
- **LLM per node**: Each primitive node that needs LLM uses the ModelRouter to select the best model for its capability needs (e.g., gather needs TOOL_USE, rank needs REASONING).
- **Tool access**: Primitives declare which MCP tools they need. The composer binds only relevant tools to each subgraph.
- **Checkpointing**: Workflows compile with a checkpointer so multi-step pipelines survive failures and can resume.

## Non-Goals (for now)

- Team orchestration (sprint, retro, assemble) — requires multi-agent coordination, defer to later
- Fork-context skills (blossom, consensus) — requires parallel agent spawning
- File-based intermediate results — use LangGraph checkpointing instead
- Full 53-skill parity — only the most composable core primitives
