"""Verify primitive — check claims against evidence.

Marks each claim as VERIFIED, REFUTED, or UNCERTAIN with evidence.
Uses tools to check claims against session data when available.

Graph: verify → END (or with tools: verify → tools → verify → END)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from seam_agents.workflows.state import (
    Confidence,
    PipeItem,
    PipeOutput,
    WorkflowState,
)

log = logging.getLogger(__name__)

VERIFY_SYSTEM = """\
You are a verification agent. For each claim or finding, check it against
available evidence and mark it as VERIFIED, REFUTED, or UNCERTAIN.

Use available tools to check claims against session data (tasks, notes, activity).

Respond with valid JSON:
{
  "items": [
    {
      "title": "VERIFIED: claim title" | "REFUTED: claim title" | "UNCERTAIN: claim title",
      "detail": "the evidence for or against this claim",
      "source": "where the evidence was found",
      "confidence": "confirmed" | "likely" | "possible"
    }
  ],
  "summary": "overall verification assessment — how many claims held up?"
}

Rules:
- VERIFIED = evidence directly supports the claim
- REFUTED = evidence contradicts the claim
- UNCERTAIN = insufficient evidence either way
- Always cite the specific evidence (task ID, note content, etc.)
- Confidence reflects the strength of the evidence, not the original claim
"""


def _parse_verify_response(content: str, trace: list[str]) -> PipeOutput:
    text = content.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return PipeOutput(
            items=[PipeItem(title="Verification failed", detail=content[:500])],
            summary="Failed to parse verification output.",
            source_skill="verify",
            pipeline_trace=trace + ["verify"],
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
        source_skill="verify",
        pipeline_trace=trace + ["verify"],
    )


def build_verify_graph(llm, tools: list[Any] | None = None) -> StateGraph:
    """Build the verify primitive.

    If tools are provided, the agent can use them to check claims against
    session data. Otherwise, verification is done from context only.
    """
    has_tools = bool(tools)

    if has_tools:
        llm_with_tools = llm.bind_tools(tools)
        tool_node = ToolNode(tools)

    def verify_node(state: WorkflowState):
        prior = state.get("pipe_output")
        if not prior:
            return {"pipe_output": PipeOutput(
                items=[], summary="No claims to verify.",
                source_skill="verify", pipeline_trace=["verify"],
            )}

        context = prior.as_context()
        messages = [
            SystemMessage(content=VERIFY_SYSTEM),
            HumanMessage(content=f"Verify these claims:\n\n{context}"),
        ]
        model = llm_with_tools if has_tools else llm
        response = model.invoke(messages + state.get("messages", []))
        return {"messages": [response]}

    def should_continue(state: WorkflowState) -> str:
        if not has_tools:
            return "synthesize"
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        return "synthesize"

    def synthesize_node(state: WorkflowState):
        prior = state.get("pipe_output")
        trace = prior.pipeline_trace if prior else []
        last = state["messages"][-1]
        pipe_output = _parse_verify_response(last.content, trace)
        return {"pipe_output": pipe_output}

    graph = StateGraph(WorkflowState)
    graph.add_node("verify", verify_node)
    graph.add_node("synthesize", synthesize_node)

    if has_tools:
        graph.add_node("tools", tool_node)
        graph.add_conditional_edges("verify", should_continue, {
            "tools": "tools",
            "synthesize": "synthesize",
        })
        graph.add_edge("tools", "verify")
    else:
        graph.add_edge("verify", "synthesize")

    graph.add_edge(START, "verify")
    graph.add_edge("synthesize", END)
    return graph.compile()
