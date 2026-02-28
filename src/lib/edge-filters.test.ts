import { describe, it, expect } from 'vitest';
import { isEdgeGroupVisible, isEdgeVisible } from './edge-filters.js';
import type { LayoutEdge, LayoutEdgeGroup } from './elk-layout.js';
import type { Confidence, Direction } from '../schema/types.js';

function makeEdge(confidence: Confidence, direction: Direction): LayoutEdge {
  return { label: 'TestEvent', trigger: 'command', confidence, direction };
}

function makeGroup(edges: LayoutEdge[]): LayoutEdgeGroup {
  return { from: 'A', to: 'B', edges };
}

const ALL_CONFIDENCE = new Set<Confidence>(['CONFIRMED', 'LIKELY', 'POSSIBLE']);
const ALL_DIRECTION = new Set<Direction>(['inbound', 'outbound', 'internal']);

describe('Given isEdgeVisible', () => {
  it('when confidence and direction both match active filters, returns true', () => {
    // Per requirement: filter-in-place means passing edges are visible (opacity 1)
    const edge = makeEdge('CONFIRMED', 'outbound');
    expect(isEdgeVisible(edge, ALL_CONFIDENCE, ALL_DIRECTION)).toBe(true);
  });

  it('when confidence is filtered out, returns false', () => {
    // Per requirement: ghost filtered-out edges to opacity 0.1
    const edge = makeEdge('POSSIBLE', 'outbound');
    const confidence = new Set<Confidence>(['CONFIRMED', 'LIKELY']);
    expect(isEdgeVisible(edge, confidence, ALL_DIRECTION)).toBe(false);
  });

  it('when direction is filtered out, returns false', () => {
    // Per requirement: direction filter respected
    const edge = makeEdge('CONFIRMED', 'internal');
    const direction = new Set<Direction>(['inbound', 'outbound']);
    expect(isEdgeVisible(edge, ALL_CONFIDENCE, direction)).toBe(false);
  });

  it('when both confidence and direction are filtered out, returns false', () => {
    const edge = makeEdge('POSSIBLE', 'internal');
    const confidence = new Set<Confidence>(['CONFIRMED']);
    const direction = new Set<Direction>(['outbound']);
    expect(isEdgeVisible(edge, confidence, direction)).toBe(false);
  });

  it('when filters are empty sets, returns false (nothing passes)', () => {
    const edge = makeEdge('CONFIRMED', 'outbound');
    expect(isEdgeVisible(edge, new Set(), new Set())).toBe(false);
  });
});

describe('Given isEdgeGroupVisible', () => {
  it('when all edges in group pass filters, group is visible', () => {
    // Per requirement: filter-in-place preserves spatial context for passing groups
    const group = makeGroup([
      makeEdge('CONFIRMED', 'outbound'),
      makeEdge('LIKELY', 'inbound'),
    ]);
    expect(isEdgeGroupVisible(group, ALL_CONFIDENCE, ALL_DIRECTION)).toBe(true);
  });

  it('when at least one edge passes filters, group is visible', () => {
    // A mixed group: one visible edge keeps the group visible
    const group = makeGroup([
      makeEdge('CONFIRMED', 'outbound'),
      makeEdge('POSSIBLE', 'outbound'),
    ]);
    const confidence = new Set<Confidence>(['CONFIRMED', 'LIKELY']);
    expect(isEdgeGroupVisible(group, confidence, ALL_DIRECTION)).toBe(true);
  });

  it('when no edges pass filters, group is ghosted', () => {
    // Per requirement: ghost filtered-out edges to opacity 0.1
    const group = makeGroup([
      makeEdge('POSSIBLE', 'outbound'),
      makeEdge('POSSIBLE', 'inbound'),
    ]);
    const confidence = new Set<Confidence>(['CONFIRMED', 'LIKELY']);
    expect(isEdgeGroupVisible(group, confidence, ALL_DIRECTION)).toBe(false);
  });

  it('when group has no edges, returns false', () => {
    const group = makeGroup([]);
    expect(isEdgeGroupVisible(group, ALL_CONFIDENCE, ALL_DIRECTION)).toBe(false);
  });

  it('when direction filter excludes all edges in group, group is ghosted', () => {
    const group = makeGroup([
      makeEdge('CONFIRMED', 'internal'),
    ]);
    const direction = new Set<Direction>(['inbound', 'outbound']);
    expect(isEdgeGroupVisible(group, ALL_CONFIDENCE, direction)).toBe(false);
  });
});
