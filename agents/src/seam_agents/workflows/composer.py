"""Pipeline composer — wire primitives into executable chains.

Composes primitive subgraphs into linear pipelines where each primitive's
PipeOutput feeds the next. Also provides prebuilt canonical pipelines.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langgraph.graph import StateGraph, START, END

from seam_agents.workflows.primitives import PRIMITIVES
from seam_agents.workflows.state import WorkflowState

log = logging.getLogger(__name__)


def compose_pipeline(
    steps: list[str],
    llm: BaseChatModel,
    tools: list[Any] | None = None,
) -> StateGraph:
    """Compose a sequence of primitives into a linear pipeline.

    Each step name must match a key in PRIMITIVES. The pipeline wires
    them sequentially: step_0 → step_1 → ... → step_N.

    Args:
        steps: Ordered list of primitive names (e.g., ["gather", "distill", "rank"])
        llm: LLM instance to use for all primitives
        tools: Optional tools (passed to primitives that accept them)

    Returns:
        A compiled LangGraph that executes the pipeline.
    """
    if not steps:
        raise ValueError("Pipeline must have at least one step")

    for step in steps:
        if step not in PRIMITIVES:
            raise ValueError(f"Unknown primitive: {step}. Available: {list(PRIMITIVES.keys())}")

    # Build each primitive subgraph
    subgraphs = {}
    for step in steps:
        builder = PRIMITIVES[step]
        subgraphs[step] = builder(llm=llm, tools=tools or [])

    # Wire into a sequential pipeline
    graph = StateGraph(WorkflowState)

    for step in steps:
        graph.add_node(step, subgraphs[step])

    # Chain edges: START → step_0 → step_1 → ... → END
    graph.add_edge(START, steps[0])
    for i in range(len(steps) - 1):
        graph.add_edge(steps[i], steps[i + 1])
    graph.add_edge(steps[-1], END)

    return graph.compile()


# --- Canonical Pipelines ---
# These match tackline's documented chain patterns.

def build_research_pipeline(llm: BaseChatModel, tools: list[Any] | None = None):
    """gather → distill → rank: Research, condense, prioritize."""
    return compose_pipeline(["gather", "distill", "rank"], llm, tools)


def build_analysis_pipeline(llm: BaseChatModel, tools: list[Any] | None = None):
    """gather → critique → rank: Research, stress-test, prioritize."""
    return compose_pipeline(["gather", "critique", "rank"], llm, tools)


def build_planning_pipeline(llm: BaseChatModel, tools: list[Any] | None = None):
    """decompose → rank: Break down, prioritize."""
    return compose_pipeline(["decompose", "rank"], llm, tools)


def build_verification_pipeline(llm: BaseChatModel, tools: list[Any] | None = None):
    """gather → verify → distill: Research, fact-check, condense."""
    return compose_pipeline(["gather", "verify", "distill"], llm, tools)


# Registry of named pipelines for the router
PIPELINES = {
    "research": {
        "description": "Collect information, condense, and prioritize (gather → distill → rank)",
        "steps": ["gather", "distill", "rank"],
        "builder": build_research_pipeline,
    },
    "analysis": {
        "description": "Collect information, stress-test, and prioritize (gather → critique → rank)",
        "steps": ["gather", "critique", "rank"],
        "builder": build_analysis_pipeline,
    },
    "planning": {
        "description": "Break down a goal and prioritize sub-parts (decompose → rank)",
        "steps": ["decompose", "rank"],
        "builder": build_planning_pipeline,
    },
    "verification": {
        "description": "Collect information, verify claims, condense (gather → verify → distill)",
        "steps": ["gather", "verify", "distill"],
        "builder": build_verification_pipeline,
    },
}
