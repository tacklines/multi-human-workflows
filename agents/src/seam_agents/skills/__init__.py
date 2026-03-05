"""Skill registry — Claude Code-style skills for Seam agents."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from seam_agents.models.router import ModelRequirement


@dataclass
class Skill:
    """A named, reusable prompt+tool bundle that an agent can invoke."""

    name: str
    description: str
    system_prompt: str
    # Optional list of extra tool names this skill requires beyond the defaults
    extra_tools: list[str] | None = None
    # Optional model requirement — lets the skill express what kind of model it needs
    # e.g., ModelRequirement(capabilities=[Capability.CODING], max_budget=Budget.FREE)
    model_requirement: ModelRequirement | None = None


# Global skill registry
_registry: dict[str, Skill] = {}


def register_skill(skill: Skill):
    _registry[skill.name] = skill


def get_skill(name: str) -> Skill | None:
    return _registry.get(name)


def list_skills() -> list[Skill]:
    return list(_registry.values())
