"""Distill primitive — condense findings to essential points.

Reads PipeOutput from state, asks LLM to reduce to the N most essential
items, writes condensed PipeOutput back.

Graph: distill → END
"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END

from seam_agents.workflows.state import (
    Confidence,
    PipeItem,
    PipeOutput,
    WorkflowState,
)

log = logging.getLogger(__name__)

DISTILL_SYSTEM = """\
You are a distillation agent. Given a set of findings, reduce them to the
most essential items. Remove redundancy, merge overlapping findings, and
keep only what matters most.

Respond with valid JSON:
{
  "items": [
    {
      "title": "concise title",
      "detail": "essential detail only",
      "source": "original source",
      "confidence": "confirmed" | "likely" | "possible"
    }
  ],
  "summary": "one paragraph synthesis of the distilled findings"
}

Rules:
- Target 3-7 items (fewer than input)
- Merge items that say the same thing from different angles
- Preserve the highest-confidence version when merging
- Keep source attribution from the original findings
- The summary should be tighter and more actionable than the input summary
"""


def _parse_distill_response(content: str, trace: list[str]) -> PipeOutput:
    """Parse LLM response into PipeOutput."""
    text = content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return PipeOutput(
            items=[PipeItem(title="Distillation failed", detail=content[:500])],
            summary="Failed to parse distillation output.",
            source_skill="distill",
            pipeline_trace=trace + ["distill"],
        )

    items = []
    for raw in data.get("items", []):
        conf = None
        if raw.get("confidence"):
            try:
                conf = Confidence(raw["confidence"].lower())
            except ValueError:
                conf = Confidence.POSSIBLE
        items.append(PipeItem(
            title=raw.get("title", "Untitled"),
            detail=raw.get("detail", ""),
            source=raw.get("source"),
            confidence=conf,
        ))

    return PipeOutput(
        items=items,
        summary=data.get("summary", "No summary provided."),
        source_skill="distill",
        pipeline_trace=trace + ["distill"],
    )


def build_distill_graph(llm, tools=None) -> StateGraph:
    """Build the distill primitive. Tools are unused but accepted for API consistency."""

    def distill_node(state: WorkflowState):
        prior = state.get("pipe_output")
        if not prior:
            return {"pipe_output": PipeOutput(
                items=[], summary="No input to distill.",
                source_skill="distill", pipeline_trace=["distill"],
            )}

        context = prior.as_context()
        messages = [
            SystemMessage(content=DISTILL_SYSTEM),
            HumanMessage(content=f"Distill these findings:\n\n{context}"),
        ]
        response = llm.invoke(messages)
        pipe_output = _parse_distill_response(response.content, prior.pipeline_trace)
        return {"pipe_output": pipe_output}

    graph = StateGraph(WorkflowState)
    graph.add_node("distill", distill_node)
    graph.add_edge(START, "distill")
    graph.add_edge("distill", END)
    return graph.compile()
