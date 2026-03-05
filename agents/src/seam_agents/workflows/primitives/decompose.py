"""Decompose primitive — break a goal into bounded sub-parts.

The split primitive: takes one big thing, emits several smaller things
with clear scope boundaries and interfaces.

Graph: decompose → END
"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END

from seam_agents.workflows.state import (
    PipeItem,
    PipeOutput,
    WorkflowState,
)

log = logging.getLogger(__name__)

DECOMPOSE_SYSTEM = """\
You are a decomposition agent. Break the given goal or topic into 3-7
bounded sub-parts with clear scope boundaries.

Respond with valid JSON:
{
  "items": [
    {
      "title": "sub-part name",
      "detail": "what this sub-part covers and its boundaries",
      "source": "what aspect of the goal this addresses"
    }
  ],
  "summary": "how these parts relate and where the boundaries are"
}

Rules:
- Each sub-part should be independently completable
- Boundaries should be crisp — no overlapping scope
- Order by dependency (things that must come first are listed first)
- Title format: verb + noun (e.g., "Build auth middleware")
- Detail should explain WHAT is in scope AND what is explicitly out of scope
"""


def _parse_decompose_response(content: str, trace: list[str]) -> PipeOutput:
    text = content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return PipeOutput(
            items=[PipeItem(title="Decomposition failed", detail=content[:500])],
            summary="Failed to parse decomposition output.",
            source_skill="decompose",
            pipeline_trace=trace + ["decompose"],
        )

    items = []
    for raw in data.get("items", []):
        items.append(PipeItem(
            title=raw.get("title", "Untitled"),
            detail=raw.get("detail", ""),
            source=raw.get("source"),
        ))

    return PipeOutput(
        items=items,
        summary=data.get("summary", "No summary provided."),
        source_skill="decompose",
        pipeline_trace=trace + ["decompose"],
    )


def build_decompose_graph(llm, tools=None) -> StateGraph:
    """Build the decompose primitive."""

    def decompose_node(state: WorkflowState):
        prior = state.get("pipe_output")
        goal = state.get("goal", "")

        if prior:
            context = prior.as_context()
            prompt = f"Decompose this into bounded sub-parts:\n\n{context}"
        else:
            prompt = f"Decompose this goal into bounded sub-parts: {goal}"

        messages = [
            SystemMessage(content=DECOMPOSE_SYSTEM),
            HumanMessage(content=prompt),
        ]
        response = llm.invoke(messages)
        trace = prior.pipeline_trace if prior else []
        pipe_output = _parse_decompose_response(response.content, trace)
        return {"pipe_output": pipe_output}

    graph = StateGraph(WorkflowState)
    graph.add_node("decompose", decompose_node)
    graph.add_edge(START, "decompose")
    graph.add_edge("decompose", END)
    return graph.compile()
