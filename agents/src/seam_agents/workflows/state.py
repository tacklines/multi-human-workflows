"""Typed state models for the workflow engine.

These models replace tackline's markdown pipe-format with Pydantic-validated
typed state that flows between LangGraph nodes. Each primitive reads
`pipe_output` from state and writes its own `pipe_output` back.
"""

from __future__ import annotations

import operator
from enum import Enum
from typing import Annotated, Any, TypedDict

from pydantic import BaseModel, Field


class Confidence(str, Enum):
    """Confidence level for a finding or claim."""
    CONFIRMED = "confirmed"
    LIKELY = "likely"
    POSSIBLE = "possible"


class PipeItem(BaseModel):
    """A single item in a workflow pipeline output.

    Corresponds to a numbered item in tackline's pipe-format.
    """
    title: str
    detail: str
    source: str | None = None
    confidence: Confidence | None = None
    scores: dict[str, float] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PipeOutput(BaseModel):
    """Structured output from a workflow primitive.

    Corresponds to a complete pipe-format block in tackline.
    """
    items: list[PipeItem]
    summary: str
    source_skill: str
    pipeline_trace: list[str] = Field(default_factory=list)

    def as_context(self) -> str:
        """Render as markdown for injection into LLM prompts."""
        lines = [
            f"## {self.source_skill} output",
            f"**Pipeline**: {' -> '.join(self.pipeline_trace)}",
            f"### Items ({len(self.items)})",
        ]
        for i, item in enumerate(self.items, 1):
            detail = f"**{item.title}** — {item.detail}"
            if item.source:
                detail += f"\n   - source: {item.source}"
            if item.confidence:
                detail += f"\n   - confidence: {item.confidence.value}"
            if item.scores:
                scores_str = ", ".join(f"{k}: {v:.1f}" for k, v in item.scores.items())
                detail += f"\n   - scores: {scores_str}"
            lines.append(f"{i}. {detail}")
        lines.append(f"\n### Summary\n\n{self.summary}")
        return "\n".join(lines)


class WorkflowState(TypedDict, total=False):
    """Shared state for workflow graphs.

    All primitives read/write through this state. The `pipe_output` key
    is the primary data channel between primitives in a pipeline.
    """
    # The accumulated messages (for LLM context)
    messages: Annotated[list, operator.add]
    # The current pipeline output (previous primitive's result)
    pipe_output: PipeOutput | None
    # The user's goal or topic
    goal: str
    # Criteria for ranking/filtering/assessing
    criteria: str | None
    # Available tools for the current primitive
    tools: list[Any]
