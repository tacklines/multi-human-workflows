"""Gather primitive — collect information into structured findings.

The universal input primitive. Searches available tools (Seam session data,
tasks, notes) and synthesizes findings with sources and confidence levels.

Graph: assess_sources → search → synthesize → END
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

GATHER_SYSTEM = """\
You are a structured information gathering agent. Your job is to collect
findings on a topic using the available tools, then produce a structured
JSON response.

IMPORTANT: You must respond with valid JSON matching this exact schema:
{
  "items": [
    {
      "title": "short title",
      "detail": "detailed finding",
      "source": "where you found this (tool name, task ID, etc.)",
      "confidence": "confirmed" | "likely" | "possible"
    }
  ],
  "summary": "one paragraph synthesis of all findings"
}

Search strategy:
1. Use list_tasks to find relevant tasks and their context
2. Use list_notes to find documented knowledge
3. Use list_activity for recent events related to the topic
4. Use get_task or get_note for deeper detail on promising leads

Cast a wide net first, then synthesize. Every finding must cite its source.
"""

SYNTHESIZE_SYSTEM = """\
You have gathered information using tools. Now synthesize all findings into
a structured JSON response. Review the tool results in the conversation and
produce:

{
  "items": [
    {
      "title": "short title",
      "detail": "detailed finding",
      "source": "where you found this",
      "confidence": "confirmed" | "likely" | "possible"
    }
  ],
  "summary": "one paragraph synthesis"
}

Include ALL distinct findings. Deduplicate overlapping results.
Assign confidence based on evidence strength:
- confirmed: directly observed in tool output
- likely: strongly implied by multiple signals
- possible: single weak signal or inference
"""


def _parse_gather_response(content: str) -> PipeOutput:
    """Parse LLM JSON response into PipeOutput."""
    # Try to extract JSON from the response
    text = content.strip()
    # Handle markdown code blocks
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Fallback: treat the whole response as a single finding
        return PipeOutput(
            items=[PipeItem(
                title="Unstructured findings",
                detail=content[:500],
                confidence=Confidence.POSSIBLE,
            )],
            summary=content[:200],
            source_skill="gather",
            pipeline_trace=["gather"],
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
        source_skill="gather",
        pipeline_trace=["gather"],
    )


def build_gather_graph(
    llm,
    tools: list[Any],
) -> StateGraph:
    """Build the gather primitive as a LangGraph subgraph.

    Args:
        llm: A LangChain chat model (already instantiated).
        tools: List of LangChain tools available for searching.
    """
    llm_with_tools = llm.bind_tools(tools)
    tool_node = ToolNode(tools)

    def search_node(state: WorkflowState):
        """Use tools to gather information about the goal."""
        goal = state.get("goal", "the current session")
        messages = [
            SystemMessage(content=GATHER_SYSTEM),
            HumanMessage(content=f"Gather information about: {goal}"),
        ]
        # Include any prior context
        if state.get("pipe_output"):
            context = state["pipe_output"].as_context()
            messages.append(HumanMessage(content=f"Prior context:\n{context}"))
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: WorkflowState) -> str:
        """Route based on whether the LLM wants to call more tools."""
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        return "synthesize"

    def synthesize_node(state: WorkflowState):
        """Parse tool results into structured PipeOutput."""
        messages = [SystemMessage(content=SYNTHESIZE_SYSTEM)] + state["messages"]
        response = llm.invoke(messages)
        pipe_output = _parse_gather_response(response.content)
        return {"pipe_output": pipe_output}

    graph = StateGraph(WorkflowState)
    graph.add_node("search", search_node)
    graph.add_node("tools", tool_node)
    graph.add_node("synthesize", synthesize_node)

    graph.add_edge(START, "search")
    graph.add_conditional_edges("search", should_continue, {
        "tools": "tools",
        "synthesize": "synthesize",
    })
    graph.add_edge("tools", "search")  # Loop back for more tool calls
    graph.add_edge("synthesize", END)

    return graph.compile()
