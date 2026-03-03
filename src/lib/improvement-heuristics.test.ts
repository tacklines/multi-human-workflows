import { describe, it, expect } from 'vitest';
import { suggestImprovementsForFile } from './improvement-heuristics.js';
import type { CandidateEventsFile, DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<DomainEvent> & { name: string }): DomainEvent {
  return {
    name: overrides.name,
    aggregate: overrides.aggregate ?? 'Order',
    trigger: overrides.trigger ?? 'user action',
    payload: overrides.payload ?? [{ field: 'id', type: 'string' }],
    integration: overrides.integration ?? { direction: 'internal' },
    confidence: overrides.confidence ?? 'LIKELY',
    state_change: overrides.state_change,
    notes: overrides.notes,
    sources: overrides.sources,
  };
}

function makeFile(
  events: DomainEvent[],
  overrides: Partial<CandidateEventsFile> = {}
): CandidateEventsFile {
  return {
    metadata: {
      role: 'backend',
      scope: 'Order service',
      goal: 'Model order lifecycle',
      generated_at: '2026-01-01T00:00:00Z',
      event_count: events.length,
      assumption_count: 0,
    },
    domain_events: events,
    boundary_assumptions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: missing failure events
// ---------------------------------------------------------------------------

describe('suggestImprovementsForFile — missing failure events', () => {
  describe('Given a command-like event with no failure counterpart', () => {
    it('Then suggests adding a failure event for "Created" events', () => {
      const file = makeFile([makeEvent({ name: 'OrderCreated' })]);
      const suggestions = suggestImprovementsForFile(file);
      const failSuggestion = suggestions.find((s) => s.type === 'missing_event');
      expect(failSuggestion).toBeDefined();
      expect(failSuggestion?.description).toContain('OrderCreated');
      expect(failSuggestion?.description).toContain('OrderFailed');
    });

    it('Then suggests failure events for "Submitted" events', () => {
      const file = makeFile([makeEvent({ name: 'PaymentSubmitted' })]);
      const suggestions = suggestImprovementsForFile(file);
      const failSuggestion = suggestions.find((s) => s.type === 'missing_event');
      expect(failSuggestion).toBeDefined();
      expect(failSuggestion?.suggestedContent?.name).toBe('PaymentFailed');
    });

    it('Then includes suggested content with correct aggregate', () => {
      const file = makeFile([makeEvent({ name: 'OrderCreated', aggregate: 'Order' })]);
      const suggestions = suggestImprovementsForFile(file);
      const failSuggestion = suggestions.find((s) => s.type === 'missing_event');
      expect(failSuggestion?.suggestedContent?.aggregate).toBe('Order');
      expect(failSuggestion?.suggestedContent?.confidence).toBe('POSSIBLE');
    });
  });

  describe('Given a command-like event that already has a failure counterpart', () => {
    it('Then does not suggest a redundant failure event', () => {
      const file = makeFile([
        makeEvent({ name: 'OrderCreated' }),
        makeEvent({ name: 'OrderFailed' }),
      ]);
      const suggestions = suggestImprovementsForFile(file);
      expect(suggestions.filter((s) => s.type === 'missing_event')).toHaveLength(0);
    });

    it('Then accepts "Failed" anywhere in the name as a match', () => {
      const file = makeFile([
        makeEvent({ name: 'OrderSubmitted' }),
        makeEvent({ name: 'OrderProcessingFailed' }),
      ]);
      const suggestions = suggestImprovementsForFile(file);
      // "OrderProcessingFailed" contains "failed" — should be recognized
      expect(suggestions.filter((s) => s.type === 'missing_event')).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: missing assumptions
// ---------------------------------------------------------------------------

describe('suggestImprovementsForFile — missing assumptions', () => {
  describe('Given a file with no boundary assumptions', () => {
    it('Then suggests adding at least one assumption', () => {
      const file = makeFile([makeEvent({ name: 'OrderCreated' })]);
      const suggestions = suggestImprovementsForFile(file);
      const assumptionSuggestion = suggestions.find((s) => s.type === 'missing_assumption');
      expect(assumptionSuggestion).toBeDefined();
      expect(assumptionSuggestion?.description).toContain('boundary assumptions');
    });
  });

  describe('Given a file with at least one boundary assumption', () => {
    it('Then does not suggest adding assumptions', () => {
      const file = makeFile([makeEvent({ name: 'OrderCreated' })], {
        boundary_assumptions: [
          {
            id: 'a1',
            type: 'ownership' as const,
            statement: 'Order service owns the Order aggregate',
            affects_events: ['OrderCreated'],
            confidence: 'CONFIRMED' as const,
            verify_with: 'team-orders',
          },
        ],
        metadata: {
          role: 'backend',
          scope: 'Order service',
          goal: 'Model order lifecycle',
          generated_at: '2026-01-01T00:00:00Z',
          event_count: 1,
          assumption_count: 1,
        },
      });
      const suggestions = suggestImprovementsForFile(file);
      expect(suggestions.filter((s) => s.type === 'missing_assumption')).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: confidence upgrades
// ---------------------------------------------------------------------------

describe('suggestImprovementsForFile — confidence upgrades', () => {
  describe('Given events with POSSIBLE confidence', () => {
    it('Then suggests upgrading each POSSIBLE event to LIKELY', () => {
      const file = makeFile([
        makeEvent({ name: 'MaybeHappened', confidence: 'POSSIBLE' }),
        makeEvent({ name: 'AlsoMaybe', confidence: 'POSSIBLE' }),
      ]);
      const suggestions = suggestImprovementsForFile(file);
      const upgrades = suggestions.filter((s) => s.type === 'confidence_upgrade');
      expect(upgrades).toHaveLength(2);
      const names = upgrades.map((s) => s.suggestedContent?.name);
      expect(names).toContain('MaybeHappened');
      expect(names).toContain('AlsoMaybe');
    });

    it('Then includes the event name in the description', () => {
      const file = makeFile([makeEvent({ name: 'MaybeHappened', confidence: 'POSSIBLE' })]);
      const suggestions = suggestImprovementsForFile(file);
      const upgrade = suggestions.find((s) => s.type === 'confidence_upgrade');
      expect(upgrade?.description).toContain('MaybeHappened');
      expect(upgrade?.suggestedContent?.confidence).toBe('LIKELY');
    });
  });

  describe('Given events with LIKELY or CONFIRMED confidence', () => {
    it('Then does not suggest confidence upgrades', () => {
      const file = makeFile([
        makeEvent({ name: 'LikelyEvent', confidence: 'LIKELY' }),
        makeEvent({ name: 'ConfirmedEvent', confidence: 'CONFIRMED' }),
      ]);
      const suggestions = suggestImprovementsForFile(file);
      expect(suggestions.filter((s) => s.type === 'confidence_upgrade')).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: outbound integration pattern
// ---------------------------------------------------------------------------

describe('suggestImprovementsForFile — outbound pattern', () => {
  describe('Given a file with no outbound events', () => {
    it('Then suggests considering outbound emissions', () => {
      const file = makeFile([
        makeEvent({ name: 'OrderCreated', integration: { direction: 'internal' } }),
      ]);
      const suggestions = suggestImprovementsForFile(file);
      const patternMatch = suggestions.find((s) => s.type === 'pattern_match');
      expect(patternMatch).toBeDefined();
      expect(patternMatch?.description).toContain('outbound');
    });
  });

  describe('Given a file with at least one outbound event', () => {
    it('Then does not suggest the outbound pattern', () => {
      const file = makeFile([
        makeEvent({ name: 'OrderCreated', integration: { direction: 'internal' } }),
        makeEvent({ name: 'OrderCompleted', integration: { direction: 'outbound' } }),
      ]);
      const suggestions = suggestImprovementsForFile(file);
      expect(suggestions.filter((s) => s.type === 'pattern_match')).toHaveLength(0);
    });
  });

  describe('Given an empty file with no events', () => {
    it('Then does not suggest the outbound pattern (no events to analyze)', () => {
      const file = makeFile([]);
      const suggestions = suggestImprovementsForFile(file);
      expect(suggestions.filter((s) => s.type === 'pattern_match')).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: combined scenarios
// ---------------------------------------------------------------------------

describe('suggestImprovementsForFile — combined scenarios', () => {
  describe('Given a well-formed file with no gaps', () => {
    it('Then returns no suggestions', () => {
      const file: CandidateEventsFile = {
        metadata: {
          role: 'backend',
          scope: 'Order service',
          goal: 'Model order lifecycle',
          generated_at: '2026-01-01T00:00:00Z',
          event_count: 3,
          assumption_count: 1,
        },
        domain_events: [
          makeEvent({ name: 'OrderCreated', confidence: 'CONFIRMED', integration: { direction: 'internal' } }),
          makeEvent({ name: 'OrderFailed', confidence: 'CONFIRMED', integration: { direction: 'internal' } }),
          makeEvent({ name: 'OrderCompleted', confidence: 'CONFIRMED', integration: { direction: 'outbound' } }),
        ],
        boundary_assumptions: [
          {
            id: 'a1',
            type: 'ownership' as const,
            statement: 'Order service owns the Order aggregate',
            affects_events: ['OrderCreated'],
            confidence: 'CONFIRMED' as const,
            verify_with: 'team-orders',
          },
        ],
      };
      const suggestions = suggestImprovementsForFile(file);
      expect(suggestions).toHaveLength(0);
    });
  });
});
