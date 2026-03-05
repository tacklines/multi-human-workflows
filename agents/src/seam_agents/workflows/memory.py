"""Workflow memory — cross-session learnings via LangGraph Store.

Provides a learning lifecycle for agents: after workflows complete,
findings and patterns are persisted to a Store and retrieved as
context for future workflows.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from langgraph.store.memory import InMemoryStore

from seam_agents.workflows.state import PipeOutput

log = logging.getLogger(__name__)

# Module-level store instance. In production, this would be backed by
# Redis or Postgres. For now, InMemoryStore persists within a process.
_store: InMemoryStore | None = None


def get_store() -> InMemoryStore:
    """Get or create the workflow memory store."""
    global _store
    if _store is None:
        _store = InMemoryStore()
    return _store


def store_learning(
    agent_id: str,
    session_id: str,
    workflow_name: str,
    pipe_output: PipeOutput,
) -> None:
    """Persist a workflow result as a learning.

    Learnings are namespaced by agent_id and tagged with session context.
    """
    store = get_store()
    namespace = (agent_id, "learnings")
    key = f"{workflow_name}-{datetime.now(timezone.utc).isoformat()}"

    store.put(namespace, key, {
        "workflow": workflow_name,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "item_count": len(pipe_output.items),
        "summary": pipe_output.summary,
        "pipeline": " → ".join(pipe_output.pipeline_trace),
        "top_items": [
            {"title": item.title, "detail": item.detail[:200]}
            for item in pipe_output.items[:5]
        ],
    })
    log.info("Stored learning: %s/%s (%d items)", agent_id, workflow_name, len(pipe_output.items))


def recall_learnings(
    agent_id: str,
    query: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Recall relevant past learnings for an agent.

    Returns a list of learning summaries relevant to the query.
    """
    store = get_store()
    namespace = (agent_id, "learnings")

    try:
        results = store.search(namespace, query=query, limit=limit)
        return [item.value for item in results]
    except Exception as e:
        log.warning("Failed to search learnings: %s", e)
        # Fallback: list recent items without semantic search
        try:
            items = list(store.list(namespace, limit=limit))
            return [item.value for item in items]
        except Exception:
            return []


def format_learnings_context(learnings: list[dict[str, Any]]) -> str:
    """Format recalled learnings as context for injection into prompts."""
    if not learnings:
        return ""

    lines = ["## Relevant Past Findings\n"]
    for learning in learnings:
        workflow = learning.get("workflow", "unknown")
        summary = learning.get("summary", "")
        pipeline = learning.get("pipeline", "")
        lines.append(f"- **{workflow}** ({pipeline}): {summary[:200]}")

    return "\n".join(lines)
