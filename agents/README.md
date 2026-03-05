# Seam Agents

LangGraph-powered agents for Seam collaborative sessions.

## Setup

```bash
cp .env.example .env
# Edit .env with your API keys
uv sync
```

## Usage

```bash
# Interactive REPL
uv run seam-agent <agent-code>

# Single-shot with a skill
uv run seam-agent <agent-code> --skill triage -m "Review all open tasks"

# Custom agent name
uv run seam-agent <agent-code> --name "my-agent"
```

## Skills

- `/triage` — Review open tasks, prioritize, suggest next actions
- `/decompose` — Break a task into subtasks
- `/summarize` — Produce a session summary
- `/research` — Investigate a topic, write findings to a note

## Architecture

- `src/seam_agents/mcp_client.py` — MCP stdio client connecting to `seam-mcp`
- `src/seam_agents/tools.py` — Converts MCP tools to LangChain StructuredTools
- `src/seam_agents/agents/session_agent.py` — Main LangGraph agent (tool-calling loop)
- `src/seam_agents/skills/` — Skill registry + built-in skills
- `src/seam_agents/tracing.py` — Langfuse callback handler integration
