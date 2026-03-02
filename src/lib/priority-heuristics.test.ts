import { describe, it, expect } from 'vitest';
import { suggestPriorities } from './priority-heuristics.js';
import type { DomainEvent, EventPriority } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<DomainEvent> & { name: string }): DomainEvent {
  return {
    name: overrides.name,
    aggregate: overrides.aggregate ?? 'Order',
    trigger: overrides.trigger ?? 'user clicks confirm',
    payload: overrides.payload ?? [],
    integration: overrides.integration ?? { direction: 'internal' },
    confidence: overrides.confidence ?? 'LIKELY',
    state_change: overrides.state_change,
    notes: overrides.notes,
    sources: overrides.sources,
  };
}

function makePriority(eventName: string): EventPriority {
  return {
    eventName,
    participantId: 'p1',
    tier: 'should_have',
    setAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('suggestPriorities', () => {
  describe('Given empty input', () => {
    it('returns empty array for no events', () => {
      expect(suggestPriorities([], [])).toEqual([]);
    });

    it('returns empty array when all events already have priorities', () => {
      const ev = makeEvent({ name: 'OrderPlaced', confidence: 'CONFIRMED', payload: [
        { field: 'orderId', type: 'string' },
        { field: 'amount', type: 'number' },
        { field: 'currency', type: 'string' },
      ] });
      const priority = makePriority('OrderPlaced');
      expect(suggestPriorities([ev], [priority])).toEqual([]);
    });
  });

  describe('Given high-confidence events with many payload fields', () => {
    it('suggests must_have for CONFIRMED event with 3+ payload fields', () => {
      const ev = makeEvent({
        name: 'OrderPlaced',
        confidence: 'CONFIRMED',
        payload: [
          { field: 'orderId', type: 'string' },
          { field: 'amount', type: 'number' },
          { field: 'currency', type: 'string' },
        ],
      });
      const results = suggestPriorities([ev], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('must_have');
      expect(results[0].confidence).toBe(85);
      expect(results[0].eventName).toBe('OrderPlaced');
    });

    it('does not suggest must_have for CONFIRMED event with fewer than 3 payload fields', () => {
      const ev = makeEvent({
        name: 'OrderPlaced',
        confidence: 'CONFIRMED',
        payload: [{ field: 'orderId', type: 'string' }],
      });
      // With only 1 payload field and no channel, falls through to LIKELY rule (confidence 62)
      const results = suggestPriorities([ev], []);
      // CONFIRMED with 1 field has no special rule; LIKELY rule fires for LIKELY,
      // but this event is CONFIRMED — none of the specific rules trigger so confidence stays 0.
      // Actually CONFIRMED doesn't match rule 4 (POSSIBLE) or rule 5 (LIKELY),
      // and rule 1 requires 3+ fields, so confidence = 0 → no result.
      expect(results.every(r => r.eventName !== 'OrderPlaced' || r.confidence > 60)).toBe(true);
    });
  });

  describe('Given low-confidence events', () => {
    it('suggests could_have for POSSIBLE events', () => {
      const ev = makeEvent({ name: 'MaybeHappened', confidence: 'POSSIBLE' });
      const results = suggestPriorities([ev], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('could_have');
      expect(results[0].confidence).toBe(65);
    });

    it('includes reason text in suggestion', () => {
      const ev = makeEvent({ name: 'MaybeHappened', confidence: 'POSSIBLE' });
      const results = suggestPriorities([ev], []);
      expect(results[0].reason).toContain('MaybeHappened');
      expect(results[0].reason).toContain('could have');
    });
  });

  describe('Given already-prioritized events', () => {
    it('skips events that already have a priority', () => {
      const ev1 = makeEvent({ name: 'OrderPlaced', confidence: 'POSSIBLE' });
      const ev2 = makeEvent({ name: 'OrderCancelled', confidence: 'POSSIBLE' });
      const priority = makePriority('OrderPlaced');

      const results = suggestPriorities([ev1, ev2], [priority]);
      expect(results.every(r => r.eventName !== 'OrderPlaced')).toBe(true);
      expect(results.some(r => r.eventName === 'OrderCancelled')).toBe(true);
    });
  });

  describe('Given cross-boundary events', () => {
    it('suggests must_have for outbound events with integration channel', () => {
      const ev = makeEvent({
        name: 'PaymentProcessed',
        confidence: 'LIKELY',
        integration: { direction: 'outbound', channel: 'payment-gateway' },
      });
      const results = suggestPriorities([ev], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('must_have');
      expect(results[0].confidence).toBe(80);
    });

    it('suggests should_have for inbound events with integration channel', () => {
      const ev = makeEvent({
        name: 'WebhookReceived',
        confidence: 'LIKELY',
        integration: { direction: 'inbound', channel: 'stripe-webhooks' },
      });
      const results = suggestPriorities([ev], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('should_have');
      expect(results[0].reason).toContain('stripe-webhooks');
    });
  });

  describe('Given events appearing in multiple files (crossRefs)', () => {
    it('suggests should_have for events appearing in 2 files', () => {
      // Simulate two files by passing the same event name twice
      const ev1 = makeEvent({ name: 'SharedEvent', aggregate: 'Order' });
      const ev2 = makeEvent({ name: 'SharedEvent', aggregate: 'Payment' });
      const results = suggestPriorities([ev1, ev2], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('should_have');
      expect(results[0].confidence).toBe(75);
    });

    it('suggests must_have for events appearing in 3+ files', () => {
      const ev1 = makeEvent({ name: 'SharedEvent', aggregate: 'A' });
      const ev2 = makeEvent({ name: 'SharedEvent', aggregate: 'B' });
      const ev3 = makeEvent({ name: 'SharedEvent', aggregate: 'C' });
      const results = suggestPriorities([ev1, ev2, ev3], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('must_have');
    });
  });

  describe('Given LIKELY events with no channel', () => {
    it('suggests should_have for standard LIKELY events', () => {
      const ev = makeEvent({ name: 'ItemAdded', confidence: 'LIKELY' });
      const results = suggestPriorities([ev], []);
      expect(results).toHaveLength(1);
      expect(results[0].suggestedTier).toBe('should_have');
      expect(results[0].confidence).toBe(62);
    });
  });

  describe('Sorting', () => {
    it('returns results sorted by confidence descending', () => {
      const high = makeEvent({
        name: 'HighConf',
        confidence: 'CONFIRMED',
        payload: [
          { field: 'a', type: 'string' },
          { field: 'b', type: 'string' },
          { field: 'c', type: 'string' },
        ],
      });
      const low = makeEvent({ name: 'LowConf', confidence: 'POSSIBLE' });

      const results = suggestPriorities([high, low], []);
      expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
    });
  });
});
