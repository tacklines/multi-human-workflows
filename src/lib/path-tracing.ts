/**
 * Path tracing pure functions for the flow diagram.
 *
 * Given a set of edge groups, builds an adjacency map and provides BFS
 * traversal to find all nodes upstream or downstream of a selected node.
 *
 * Pure functions only -- no DOM, no side effects.
 */
import type { LayoutEdgeGroup } from './elk-layout.js';

export interface AdjacencyMap {
  /** nodeId → Set of downstream node IDs */
  downstream: Map<string, Set<string>>;
  /** nodeId → Set of upstream node IDs */
  upstream: Map<string, Set<string>>;
}

export interface PathTraceResult {
  /** All node IDs upstream of the selected node (not including the node itself) */
  upstream: Set<string>;
  /** All node IDs downstream of the selected node (not including the node itself) */
  downstream: Set<string>;
  /** Edge group keys (from::to format) that are part of the traced path */
  connectedEdges: Set<string>;
}

/**
 * Build an adjacency map from edge groups.
 *
 * Supports forward (downstream) and reverse (upstream) lookups.
 * Self-loop edges (from === to) are included in the map but handled
 * gracefully during BFS via visited sets.
 */
export function buildAdjacencyMap(edgeGroups: LayoutEdgeGroup[]): AdjacencyMap {
  const downstream = new Map<string, Set<string>>();
  const upstream = new Map<string, Set<string>>();

  function ensureNode(id: string): void {
    if (!downstream.has(id)) downstream.set(id, new Set());
    if (!upstream.has(id)) upstream.set(id, new Set());
  }

  for (const group of edgeGroups) {
    const { from, to } = group;
    ensureNode(from);
    ensureNode(to);
    downstream.get(from)!.add(to);
    upstream.get(to)!.add(from);
  }

  return { downstream, upstream };
}

/**
 * BFS traversal in a given direction.
 *
 * Returns all reachable node IDs from `startId` using the provided
 * adjacency set function. Does NOT include the start node itself.
 * Cycles are handled via a visited set.
 */
function bfs(
  startId: string,
  getNeighbors: (id: string) => Set<string> | undefined,
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = getNeighbors(current) ?? new Set<string>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Remove the start node from results -- callers only want reachable others
  visited.delete(startId);
  return visited;
}

/**
 * Trace all nodes upstream (backwards) of the given node via BFS.
 *
 * Returns a Set of node IDs reachable going backwards through edges.
 * Does not include `nodeId` itself.
 */
export function traceUpstream(nodeId: string, adjacency: AdjacencyMap): Set<string> {
  return bfs(nodeId, (id) => adjacency.upstream.get(id));
}

/**
 * Trace all nodes downstream (forwards) of the given node via BFS.
 *
 * Returns a Set of node IDs reachable going forwards through edges.
 * Does not include `nodeId` itself.
 */
export function traceDownstream(nodeId: string, adjacency: AdjacencyMap): Set<string> {
  return bfs(nodeId, (id) => adjacency.downstream.get(id));
}

/**
 * Trace both upstream and downstream paths from a node and identify
 * which edge groups are part of the traced path.
 *
 * Returns upstream nodes, downstream nodes, and the set of edge group keys
 * (in `from::to` format) that connect any traced nodes.
 */
export function tracePaths(
  nodeId: string,
  adjacency: AdjacencyMap,
  edgeGroups: LayoutEdgeGroup[],
): PathTraceResult {
  const upstream = traceUpstream(nodeId, adjacency);
  const downstream = traceDownstream(nodeId, adjacency);

  // All nodes involved: upstream + the node itself + downstream
  const allNodes = new Set<string>([...upstream, nodeId, ...downstream]);

  // An edge group is "connected" if both its from and to nodes are in allNodes
  const connectedEdges = new Set<string>();
  for (const group of edgeGroups) {
    if (allNodes.has(group.from) && allNodes.has(group.to)) {
      connectedEdges.add(`${group.from}::${group.to}`);
    }
  }

  return { upstream, downstream, connectedEdges };
}
