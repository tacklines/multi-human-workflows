/**
 * Pure filter helpers for edge visibility in the flow diagram.
 *
 * An edge is visible if its confidence AND direction both appear in the
 * active filter sets. An edge group is visible if at least one of its
 * individual edges is visible.
 */
import type { LayoutEdge, LayoutEdgeGroup } from './elk-layout.js';
import type { Confidence, Direction } from '../schema/types.js';

/**
 * Returns true if a single edge passes both the active confidence and
 * direction filters.
 */
export function isEdgeVisible(
  edge: LayoutEdge,
  confidence: ReadonlySet<Confidence>,
  direction: ReadonlySet<Direction>,
): boolean {
  return (
    confidence.has(edge.confidence as Confidence) &&
    direction.has(edge.direction as Direction)
  );
}

/**
 * Returns true if at least one edge in the group passes the active filters.
 *
 * When false, the group should be ghosted (opacity 0.1, pointer-events none).
 */
export function isEdgeGroupVisible(
  group: LayoutEdgeGroup,
  confidence: ReadonlySet<Confidence>,
  direction: ReadonlySet<Direction>,
): boolean {
  return group.edges.some((edge) => isEdgeVisible(edge, confidence, direction));
}
