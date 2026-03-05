"""Critique primitive — adversarial review of findings.

Finds what's wrong, missing, and what could fail. Premortem/devil's
advocate pattern applied to structured findings.

Graph: critique → END
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

CRITIQUE_SYSTEM = """\
You are an adversarial review agent. Given findings or a plan, identify:
- What's wrong (errors, incorrect assumptions)
- What's missing (gaps, blind spots)
- What could fail (risks, fragile dependencies)

Respond with valid JSON:
{
  "items": [
    {
      "title": "issue title",
      "detail": "what's wrong/missing/risky and why it matters",
      "source": "which finding or aspect this critique targets",
      "confidence": "confirmed" | "likely" | "possible"
    }
  ],
  "summary": "overall assessment — how serious are these issues?"
}

Rules:
- Be specific, not vague. "Security risk" is bad; "SQL injection in the
  search endpoint because user input is interpolated" is good.
- Categorize each finding: ERROR, GAP, or RISK in the title prefix.
- Order by severity (most critical first).
- If the input looks solid, say so — but still find at least one risk.
"""


def _parse_critique_response(content: str, trace: list[str]) -> PipeOutput:
    text = content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return PipeOutput(
            items=[PipeItem(title="Critique failed", detail=content[:500])],
            summary="Failed to parse critique output.",
            source_skill="critique",
            pipeline_trace=trace + ["critique"],
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
        source_skill="critique",
        pipeline_trace=trace + ["critique"],
    )


def build_critique_graph(llm, tools=None) -> StateGraph:
    """Build the critique primitive."""

    def critique_node(state: WorkflowState):
        prior = state.get("pipe_output")
        goal = state.get("goal", "the current plan")

        if prior:
            context = prior.as_context()
            prompt = f"Critique these findings:\n\n{context}"
        else:
            prompt = f"Critique this plan/goal: {goal}"

        messages = [
            SystemMessage(content=CRITIQUE_SYSTEM),
            HumanMessage(content=prompt),
        ]
        response = llm.invoke(messages)
        trace = prior.pipeline_trace if prior else []
        pipe_output = _parse_critique_response(response.content, trace)
        return {"pipe_output": pipe_output}

    graph = StateGraph(WorkflowState)
    graph.add_node("critique", critique_node)
    graph.add_edge(START, "critique")
    graph.add_edge("critique", END)
    return graph.compile()
