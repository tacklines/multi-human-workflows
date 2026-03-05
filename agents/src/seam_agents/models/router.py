"""Model router — resolves capability requirements to the best available model."""

from __future__ import annotations

from dataclasses import dataclass, field

from seam_agents.models.registry import (
    Budget,
    Capability,
    ModelProfile,
    ModelRegistry,
)


# Budget ordering for comparison
_BUDGET_RANK = {Budget.FREE: 0, Budget.ECONOMY: 1, Budget.MODERATE: 2, Budget.UNLIMITED: 3}


@dataclass
class ModelRequirement:
    """What an agent or skill needs from a model.

    All fields are optional — omit what you don't care about.
    The more you specify, the more precisely the router can match.

    Examples:
        # "I need your best at coding"
        ModelRequirement(capabilities=[Capability.CODING])

        # "I need fast tool use, keep it cheap"
        ModelRequirement(capabilities=[Capability.TOOL_USE, Capability.SPEED], max_budget=Budget.FREE)

        # "I need something like opus" (interpreted as capability signal)
        ModelRequirement(model_hint="opus")

        # "I need frontier reasoning with long context"
        ModelRequirement(capabilities=[Capability.REASONING, Capability.LONG_CONTEXT], min_budget=Budget.UNLIMITED)

        # "Use this exact model"
        ModelRequirement(model_hint="devstral-tuned", exact=True)
    """
    capabilities: list[Capability] = field(default_factory=list)
    max_budget: Budget | None = None      # don't exceed this cost tier
    min_budget: Budget | None = None      # at least this tier (for quality floor)
    min_context: int | None = None        # minimum context window needed
    model_hint: str | None = None         # "opus", "devstral", exact model name
    exact: bool = False                   # if True, model_hint is a hard requirement


class ModelRouter:
    """Resolves a ModelRequirement to the best available model."""

    def __init__(self, registry: ModelRegistry):
        self.registry = registry

    def resolve(self, req: ModelRequirement) -> ModelProfile:
        """Find the best available model matching the requirement.

        Resolution strategy:
        1. If exact=True and model_hint matches an available model, return it
        2. If model_hint is set, extract capability signals from the hinted model's profile
        3. Score all available models against the (possibly enriched) requirements
        4. Return the highest-scoring model that passes all hard filters
        """
        available = self.registry.available
        if not available:
            raise RuntimeError("No models registered in the model registry")

        # Step 1: Exact match
        if req.exact and req.model_hint:
            canonical = self.registry.resolve_alias(req.model_hint)
            model = self.registry.get(canonical)
            if model:
                return model
            raise RuntimeError(
                f"Exact model '{req.model_hint}' requested but not available. "
                f"Available: {[m.name for m in available]}"
            )

        # Step 2: Extract capability signals from hint
        enriched_caps = list(req.capabilities)
        if req.model_hint and not enriched_caps:
            hint_profile = self.registry.get_known_profile(req.model_hint)
            if hint_profile:
                # Use the top capabilities of the hinted model as signals
                enriched_caps = _top_capabilities(hint_profile, n=3)

        # Step 3: Filter candidates
        candidates = list(available)

        if req.min_context:
            candidates = [m for m in candidates if m.context_window >= req.min_context]

        if req.max_budget:
            max_rank = _BUDGET_RANK[req.max_budget]
            candidates = [m for m in candidates if _BUDGET_RANK[m.budget] <= max_rank]

        if req.min_budget:
            min_rank = _BUDGET_RANK[req.min_budget]
            candidates = [m for m in candidates if _BUDGET_RANK[m.budget] >= min_rank]

        if not candidates:
            # Relax filters and return best available with a warning
            candidates = list(available)

        # Step 4: Score and rank
        if not enriched_caps:
            # No capability preference — pick the one with highest average capability
            return max(candidates, key=lambda m: sum(m.capabilities.values()) / max(len(m.capabilities), 1))

        return max(candidates, key=lambda m: _score(m, enriched_caps))

    def explain(self, req: ModelRequirement) -> str:
        """Explain why a particular model was chosen (for debugging/logging)."""
        try:
            chosen = self.resolve(req)
        except RuntimeError as e:
            return f"Resolution failed: {e}"

        lines = [f"Resolved to: {chosen.name} ({chosen.provider})"]
        if req.model_hint:
            lines.append(f"  Hint: '{req.model_hint}' -> interpreted as capability signal")
        if req.capabilities:
            scores = {c.value: f"{chosen.score_for(c):.2f}" for c in req.capabilities}
            lines.append(f"  Capability scores: {scores}")
        lines.append(f"  Budget: {chosen.budget.value}, Context: {chosen.context_window}, Speed: {chosen.tok_per_sec} tok/s")
        return "\n".join(lines)


def _score(model: ModelProfile, capabilities: list[Capability]) -> float:
    """Score a model against desired capabilities. Higher is better."""
    if not capabilities:
        return 0.0
    return sum(model.score_for(c) for c in capabilities) / len(capabilities)


def _top_capabilities(profile: ModelProfile, n: int = 3) -> list[Capability]:
    """Extract the top N capabilities from a model profile."""
    sorted_caps = sorted(
        profile.capabilities.items(),
        key=lambda kv: kv[1],
        reverse=True,
    )
    return [cap for cap, _ in sorted_caps[:n]]
