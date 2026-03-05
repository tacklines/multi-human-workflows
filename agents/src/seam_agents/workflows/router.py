"""Workflow router — match a goal to the right primitive or pipeline.

The /do equivalent: takes a natural language goal, classifies it,
and dispatches to the appropriate workflow.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from seam_agents.workflows.composer import PIPELINES, compose_pipeline, PRIMITIVES
from seam_agents.workflows.state import WorkflowState

log = logging.getLogger(__name__)

ROUTER_SYSTEM = """\
You are a workflow routing agent. Given a user's goal, select the best
workflow to execute. You must respond with valid JSON.

Available primitives (single-step):
{primitives}

Available pipelines (multi-step):
{pipelines}

Respond with:
{{
  "type": "primitive" | "pipeline",
  "name": "<name of the selected primitive or pipeline>",
  "goal": "<reformulated goal for the workflow>",
  "criteria": "<scoring criteria, if rank/assess is involved>",
  "reasoning": "<one sentence explaining why this workflow fits>"
}}

Selection guidelines:
- "research", "find", "investigate" → research pipeline or gather primitive
- "compare", "evaluate" → analysis pipeline
- "break down", "plan", "decompose" → planning pipeline
- "verify", "fact-check", "validate" → verification pipeline
- "summarize", "condense" → distill primitive
- "prioritize", "score", "rank" → rank primitive
- "review", "critique", "what could go wrong" → critique primitive
- If the goal doesn't fit a pipeline, pick the single best primitive
"""


def build_catalog() -> tuple[str, str]:
    """Build human-readable catalog strings for the router prompt."""
    primitives_str = "\n".join(
        f"- {name}: single-step {name} operation"
        for name in PRIMITIVES.keys()
    )
    pipelines_str = "\n".join(
        f"- {name}: {info['description']}"
        for name, info in PIPELINES.items()
    )
    return primitives_str, pipelines_str


def route_goal(
    goal: str,
    llm: BaseChatModel,
    tools: list[Any] | None = None,
) -> tuple[Any, WorkflowState]:
    """Route a goal to the appropriate workflow.

    Returns:
        (compiled_graph, initial_state) ready to invoke.
    """
    primitives_str, pipelines_str = build_catalog()

    messages = [
        SystemMessage(content=ROUTER_SYSTEM.format(
            primitives=primitives_str,
            pipelines=pipelines_str,
        )),
        HumanMessage(content=f"Route this goal: {goal}"),
    ]

    response = llm.invoke(messages)
    text = response.content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        routing = json.loads(text)
    except json.JSONDecodeError:
        log.warning("Router failed to parse response, falling back to gather")
        routing = {"type": "primitive", "name": "gather", "goal": goal}

    workflow_type = routing.get("type", "primitive")
    name = routing.get("name", "gather")
    routed_goal = routing.get("goal", goal)
    criteria = routing.get("criteria")
    reasoning = routing.get("reasoning", "")

    log.info("Router: %s → %s/%s (%s)", goal[:60], workflow_type, name, reasoning)

    # Build the graph
    if workflow_type == "pipeline" and name in PIPELINES:
        graph = PIPELINES[name]["builder"](llm, tools)
    elif name in PRIMITIVES:
        graph = PRIMITIVES[name](llm=llm, tools=tools or [])
    else:
        log.warning("Unknown workflow %s/%s, falling back to gather", workflow_type, name)
        graph = PRIMITIVES["gather"](llm=llm, tools=tools or [])

    initial_state: WorkflowState = {
        "messages": [],
        "goal": routed_goal,
        "criteria": criteria,
        "pipe_output": None,
        "tools": tools or [],
    }

    return graph, initial_state


def run_workflow(
    goal: str,
    llm: BaseChatModel,
    tools: list[Any] | None = None,
) -> WorkflowState:
    """Route a goal and execute the selected workflow end-to-end.

    Returns the final workflow state containing pipe_output with results.
    """
    graph, initial_state = route_goal(goal, llm, tools)
    result = graph.invoke(initial_state)
    return result
