"""Workflow engine — composable LangGraph workflows inspired by tackline skills.

Primitives:
    gather, distill, rank, critique, decompose, verify

Pipelines:
    research (gather → distill → rank)
    analysis (gather → critique → rank)
    planning (decompose → rank)
    verification (gather → verify → distill)

Usage:
    from seam_agents.workflows import compose_pipeline, run_workflow
    # Custom pipeline
    graph = compose_pipeline(["gather", "rank"], llm, tools)
    result = graph.invoke({"goal": "find security issues", "messages": []})
    # Auto-routed
    result = run_workflow("investigate auth patterns", llm, tools)
"""

from seam_agents.workflows.state import PipeItem, PipeOutput, WorkflowState, Confidence
from seam_agents.workflows.composer import compose_pipeline, PIPELINES
from seam_agents.workflows.primitives import PRIMITIVES
from seam_agents.workflows.router import route_goal, run_workflow

__all__ = [
    "Confidence",
    "PipeItem",
    "PipeOutput",
    "WorkflowState",
    "PRIMITIVES",
    "PIPELINES",
    "compose_pipeline",
    "route_goal",
    "run_workflow",
]
