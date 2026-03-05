"""Bridge between the workflow engine and the existing skill registry.

Registers workflow primitives and pipelines as Skill entries so they
appear in the REPL /skills listing and can be invoked via the existing
skill dispatch path. When invoked, they run the LangGraph workflow
instead of just prepending a prompt.
"""

from __future__ import annotations

import logging

from seam_agents.models import Capability, ModelRequirement
from seam_agents.skills import Skill, register_skill

log = logging.getLogger(__name__)

# Workflow-backed skills use a special marker in the system_prompt that
# the session agent recognizes to dispatch to the workflow engine.
WORKFLOW_MARKER = "[WORKFLOW_DISPATCH]"


def _workflow_prompt(workflow_type: str, name: str) -> str:
    """Build a system prompt that signals workflow dispatch."""
    return f"{WORKFLOW_MARKER} {workflow_type}:{name}"


def register_workflow_skills():
    """Register all workflow primitives and pipelines as skills."""

    # --- Primitives ---
    register_skill(Skill(
        name="w:gather",
        description="Collect structured findings on a topic (workflow)",
        system_prompt=_workflow_prompt("primitive", "gather"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.TOOL_USE, Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:distill",
        description="Condense findings to essential points (workflow)",
        system_prompt=_workflow_prompt("primitive", "distill"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:rank",
        description="Score and order items by criteria (workflow)",
        system_prompt=_workflow_prompt("primitive", "rank"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:critique",
        description="Adversarial review — what's wrong, missing, risky (workflow)",
        system_prompt=_workflow_prompt("primitive", "critique"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:decompose",
        description="Break a goal into bounded sub-parts (workflow)",
        system_prompt=_workflow_prompt("primitive", "decompose"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:verify",
        description="Check claims against evidence (workflow)",
        system_prompt=_workflow_prompt("primitive", "verify"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.TOOL_USE, Capability.REASONING],
        ),
    ))

    # --- Pipelines ---
    register_skill(Skill(
        name="w:research",
        description="Research pipeline: gather → distill → rank (workflow)",
        system_prompt=_workflow_prompt("pipeline", "research"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.TOOL_USE, Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:analysis",
        description="Analysis pipeline: gather → critique → rank (workflow)",
        system_prompt=_workflow_prompt("pipeline", "analysis"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.TOOL_USE, Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:planning",
        description="Planning pipeline: decompose → rank (workflow)",
        system_prompt=_workflow_prompt("pipeline", "planning"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.REASONING],
        ),
    ))

    register_skill(Skill(
        name="w:verification",
        description="Verification pipeline: gather → verify → distill (workflow)",
        system_prompt=_workflow_prompt("pipeline", "verification"),
        model_requirement=ModelRequirement(
            capabilities=[Capability.TOOL_USE, Capability.REASONING],
        ),
    ))

    log.info("Registered %d workflow skills", 10)
