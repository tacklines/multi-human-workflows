"""Rank primitive — score and order items by criteria.

Reads PipeOutput from state, scores each item on given criteria,
reorders by score, writes ranked PipeOutput back.

Graph: rank → END
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

RANK_SYSTEM = """\
You are a ranking agent. Given a set of items and scoring criteria, assign
numeric scores (1-5) for each criterion per item, then reorder from highest
to lowest overall score.

Respond with valid JSON:
{
  "items": [
    {
      "title": "item title",
      "detail": "item detail",
      "source": "original source",
      "confidence": "confirmed" | "likely" | "possible",
      "scores": {"criterion_name": 4.0, "another_criterion": 3.0}
    }
  ],
  "summary": "one paragraph explaining the ranking rationale and any tiebreaks"
}

Rules:
- Every item gets a score for every criterion (no blanks)
- If insufficient detail to score, assign 3 (median) and note in summary
- No two items share the same overall rank — break ties using the most
  decision-relevant criterion
- Items are ordered highest overall score first
- Overall score = average of all criterion scores
"""


def _parse_rank_response(content: str, trace: list[str]) -> PipeOutput:
    """Parse LLM response into ranked PipeOutput."""
    text = content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return PipeOutput(
            items=[PipeItem(title="Ranking failed", detail=content[:500])],
            summary="Failed to parse ranking output.",
            source_skill="rank",
            pipeline_trace=trace + ["rank"],
        )

    items = []
    for raw in data.get("items", []):
        conf = None
        if raw.get("confidence"):
            try:
                conf = Confidence(raw["confidence"].lower())
            except ValueError:
                conf = Confidence.POSSIBLE
        scores = {}
        for k, v in raw.get("scores", {}).items():
            try:
                scores[k] = float(v)
            except (ValueError, TypeError):
                scores[k] = 3.0
        items.append(PipeItem(
            title=raw.get("title", "Untitled"),
            detail=raw.get("detail", ""),
            source=raw.get("source"),
            confidence=conf,
            scores=scores,
        ))

    return PipeOutput(
        items=items,
        summary=data.get("summary", "No summary provided."),
        source_skill="rank",
        pipeline_trace=trace + ["rank"],
    )


def build_rank_graph(llm, tools=None) -> StateGraph:
    """Build the rank primitive. Tools are unused but accepted for API consistency."""

    def rank_node(state: WorkflowState):
        prior = state.get("pipe_output")
        criteria = state.get("criteria", "relevance, importance")

        if not prior:
            return {"pipe_output": PipeOutput(
                items=[], summary="No input to rank.",
                source_skill="rank", pipeline_trace=["rank"],
            )}

        context = prior.as_context()
        messages = [
            SystemMessage(content=RANK_SYSTEM),
            HumanMessage(content=(
                f"Rank these items by: {criteria}\n\n{context}"
            )),
        ]
        response = llm.invoke(messages)
        pipe_output = _parse_rank_response(response.content, prior.pipeline_trace)
        return {"pipe_output": pipe_output}

    graph = StateGraph(WorkflowState)
    graph.add_node("rank", rank_node)
    graph.add_edge(START, "rank")
    graph.add_edge("rank", END)
    return graph.compile()
