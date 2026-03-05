"""Core workflow primitives — each is a compiled LangGraph subgraph."""

from seam_agents.workflows.primitives.gather import build_gather_graph
from seam_agents.workflows.primitives.distill import build_distill_graph
from seam_agents.workflows.primitives.rank import build_rank_graph
from seam_agents.workflows.primitives.critique import build_critique_graph
from seam_agents.workflows.primitives.decompose import build_decompose_graph
from seam_agents.workflows.primitives.verify import build_verify_graph

PRIMITIVES = {
    "gather": build_gather_graph,
    "distill": build_distill_graph,
    "rank": build_rank_graph,
    "critique": build_critique_graph,
    "decompose": build_decompose_graph,
    "verify": build_verify_graph,
}

__all__ = [
    "PRIMITIVES",
    "build_gather_graph",
    "build_distill_graph",
    "build_rank_graph",
    "build_critique_graph",
    "build_decompose_graph",
    "build_verify_graph",
]
