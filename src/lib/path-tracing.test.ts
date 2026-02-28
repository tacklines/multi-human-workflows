import { describe, it, expect } from 'vitest';
import {
  buildAdjacencyMap,
  traceUpstream,
  traceDownstream,
  tracePaths,
} from './path-tracing.js';
import type { LayoutEdgeGroup } from './elk-layout.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal LayoutEdgeGroup fixtures
// ---------------------------------------------------------------------------

function edge(from: string, to: string): LayoutEdgeGroup {
  return {
    from,
    to,
    edges: [{ label: `${from}->${to}`, trigger: 'test', confidence: 'high', direction: 'outbound' }],
  };
}

// ---------------------------------------------------------------------------
// buildAdjacencyMap
// ---------------------------------------------------------------------------

describe('buildAdjacencyMap', () => {
  it('returns empty maps for empty edge groups', () => {
    const adj = buildAdjacencyMap([]);
    expect(adj.downstream.size).toBe(0);
    expect(adj.upstream.size).toBe(0);
  });

  it('registers both nodes for a single edge', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    expect(adj.downstream.has('A')).toBe(true);
    expect(adj.downstream.has('B')).toBe(true);
    expect(adj.upstream.has('A')).toBe(true);
    expect(adj.upstream.has('B')).toBe(true);
  });

  it('records downstream neighbours correctly', () => {
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('A', 'C')]);
    expect(adj.downstream.get('A')).toEqual(new Set(['B', 'C']));
    expect(adj.downstream.get('B')).toEqual(new Set());
    expect(adj.downstream.get('C')).toEqual(new Set());
  });

  it('records upstream neighbours correctly', () => {
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('C', 'B')]);
    expect(adj.upstream.get('B')).toEqual(new Set(['A', 'C']));
    expect(adj.upstream.get('A')).toEqual(new Set());
    expect(adj.upstream.get('C')).toEqual(new Set());
  });

  it('handles self-loop edges without crashing', () => {
    const adj = buildAdjacencyMap([edge('A', 'A')]);
    // A → A: downstream of A includes A, upstream of A includes A
    expect(adj.downstream.get('A')!.has('A')).toBe(true);
    expect(adj.upstream.get('A')!.has('A')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// traceDownstream
// ---------------------------------------------------------------------------

describe('traceDownstream', () => {
  it('returns empty set for a node with no outgoing edges', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    expect(traceDownstream('B', adj)).toEqual(new Set());
  });

  it('traces a simple chain A→B→C', () => {
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('B', 'C')]);
    expect(traceDownstream('A', adj)).toEqual(new Set(['B', 'C']));
    expect(traceDownstream('B', adj)).toEqual(new Set(['C']));
    expect(traceDownstream('C', adj)).toEqual(new Set());
  });

  it('traces a diamond A→B, A→C, B→D, C→D', () => {
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')]);
    expect(traceDownstream('A', adj)).toEqual(new Set(['B', 'C', 'D']));
    expect(traceDownstream('B', adj)).toEqual(new Set(['D']));
  });

  it('does not include the start node in the result', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    const result = traceDownstream('A', adj);
    expect(result.has('A')).toBe(false);
  });

  it('handles cycles without infinite loop', () => {
    // A → B → C → A (cycle)
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('B', 'C'), edge('C', 'A')]);
    const result = traceDownstream('A', adj);
    expect(result).toEqual(new Set(['B', 'C']));
  });

  it('self-loop does not cause infinite traversal', () => {
    const adj = buildAdjacencyMap([edge('A', 'A'), edge('A', 'B')]);
    const result = traceDownstream('A', adj);
    expect(result.has('A')).toBe(false);
    expect(result.has('B')).toBe(true);
  });

  it('returns empty set for node not in adjacency map', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    expect(traceDownstream('Z', adj)).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// traceUpstream
// ---------------------------------------------------------------------------

describe('traceUpstream', () => {
  it('returns empty set for a node with no incoming edges', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    expect(traceUpstream('A', adj)).toEqual(new Set());
  });

  it('traces a simple chain A→B→C from C backwards', () => {
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('B', 'C')]);
    expect(traceUpstream('C', adj)).toEqual(new Set(['A', 'B']));
    expect(traceUpstream('B', adj)).toEqual(new Set(['A']));
    expect(traceUpstream('A', adj)).toEqual(new Set());
  });

  it('traces a diamond from D backwards', () => {
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')]);
    expect(traceUpstream('D', adj)).toEqual(new Set(['A', 'B', 'C']));
  });

  it('does not include the start node in the result', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    const result = traceUpstream('B', adj);
    expect(result.has('B')).toBe(false);
  });

  it('handles cycles without infinite loop', () => {
    // A → B → C → A (cycle), trace upstream from C
    const adj = buildAdjacencyMap([edge('A', 'B'), edge('B', 'C'), edge('C', 'A')]);
    const result = traceUpstream('C', adj);
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('self-loop does not cause infinite traversal', () => {
    const adj = buildAdjacencyMap([edge('A', 'A'), edge('B', 'A')]);
    const result = traceUpstream('A', adj);
    expect(result.has('A')).toBe(false);
    expect(result.has('B')).toBe(true);
  });

  it('returns empty set for node not in adjacency map', () => {
    const adj = buildAdjacencyMap([edge('A', 'B')]);
    expect(traceUpstream('Z', adj)).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// tracePaths (combined)
// ---------------------------------------------------------------------------

describe('tracePaths', () => {
  it('returns empty sets for empty graph', () => {
    const adj = buildAdjacencyMap([]);
    const result = tracePaths('A', adj, []);
    expect(result.upstream).toEqual(new Set());
    expect(result.downstream).toEqual(new Set());
    expect(result.connectedEdges).toEqual(new Set());
  });

  it('returns upstream and downstream for a simple chain A→B→C (selected: B)', () => {
    const groups = [edge('A', 'B'), edge('B', 'C')];
    const adj = buildAdjacencyMap(groups);
    const result = tracePaths('B', adj, groups);
    expect(result.upstream).toEqual(new Set(['A']));
    expect(result.downstream).toEqual(new Set(['C']));
    expect(result.connectedEdges).toEqual(new Set(['A::B', 'B::C']));
  });

  it('identifies connected edges for a diamond (selected: A)', () => {
    const groups = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')];
    const adj = buildAdjacencyMap(groups);
    const result = tracePaths('A', adj, groups);
    expect(result.upstream).toEqual(new Set());
    expect(result.downstream).toEqual(new Set(['B', 'C', 'D']));
    expect(result.connectedEdges).toEqual(new Set(['A::B', 'A::C', 'B::D', 'C::D']));
  });

  it('only includes edges where both endpoints are in the traced path', () => {
    // E→F is disconnected from A→B→C
    const groups = [edge('A', 'B'), edge('B', 'C'), edge('E', 'F')];
    const adj = buildAdjacencyMap(groups);
    const result = tracePaths('B', adj, groups);
    expect(result.connectedEdges.has('E::F')).toBe(false);
    expect(result.connectedEdges).toEqual(new Set(['A::B', 'B::C']));
  });

  it('handles a leaf node (no edges in either direction)', () => {
    const groups = [edge('A', 'B')];
    const adj = buildAdjacencyMap(groups);
    // Trace from A (no upstream), B is downstream
    const resultA = tracePaths('A', adj, groups);
    expect(resultA.upstream).toEqual(new Set());
    expect(resultA.downstream).toEqual(new Set(['B']));
    expect(resultA.connectedEdges).toEqual(new Set(['A::B']));

    // Trace from B (no downstream), A is upstream
    const resultB = tracePaths('B', adj, groups);
    expect(resultB.upstream).toEqual(new Set(['A']));
    expect(resultB.downstream).toEqual(new Set());
    expect(resultB.connectedEdges).toEqual(new Set(['A::B']));
  });

  it('handles cycle gracefully', () => {
    // A → B → C → A
    const groups = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')];
    const adj = buildAdjacencyMap(groups);
    const result = tracePaths('B', adj, groups);
    // Downstream from B: C, A (via cycle)
    expect(result.downstream).toEqual(new Set(['C', 'A']));
    // Upstream from B: A, C (via cycle)
    expect(result.upstream).toEqual(new Set(['A', 'C']));
    // All three edges connect nodes in the path
    expect(result.connectedEdges).toEqual(new Set(['A::B', 'B::C', 'C::A']));
  });

  it('self-loop edge key appears in connectedEdges when tracing from that node', () => {
    const groups = [edge('A', 'A'), edge('A', 'B')];
    const adj = buildAdjacencyMap(groups);
    const result = tracePaths('A', adj, groups);
    // Self-loop: both from and to are 'A', which is in allNodes
    expect(result.connectedEdges.has('A::A')).toBe(true);
    expect(result.connectedEdges.has('A::B')).toBe(true);
  });
});
