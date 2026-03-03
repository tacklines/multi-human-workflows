import { describe, it, expect } from 'vitest';
import {
  deriveFromRequirement,
  deriveFromRequirements,
  type DerivationResult,
} from './requirement-derivation.js';

describe('deriveFromRequirement', () => {
  describe('Given empty input', () => {
    it('returns empty result for empty string', () => {
      const result = deriveFromRequirement('req-1', '', []);
      expect(result.requirementId).toBe('req-1');
      expect(result.events).toEqual([]);
      expect(result.assumptions).toEqual([]);
    });

    it('returns empty result for whitespace-only string', () => {
      const result = deriveFromRequirement('req-1', '   ', []);
      expect(result.events).toEqual([]);
    });
  });

  describe('Given "We need offline support"', () => {
    it('returns events about sync, cache, and conflicts', () => {
      const result = deriveFromRequirement('req-offline', 'We need offline support', []);
      const eventNames = result.events.map((e) => e.name);
      expect(eventNames.length).toBeGreaterThanOrEqual(2);
      // Should contain offline-related events
      const hasOfflineEvent = eventNames.some(
        (n) => n.toLowerCase().includes('offline') || n.toLowerCase().includes('sync') || n.toLowerCase().includes('cache'),
      );
      expect(hasOfflineEvent).toBe(true);
    });

    it('populates sourceRequirements on all events', () => {
      const result = deriveFromRequirement('req-offline', 'We need offline support', []);
      for (const event of result.events) {
        expect(event.sourceRequirements).toEqual(['req-offline']);
      }
    });
  });

  describe('Given "Users should be able to share documents"', () => {
    it('returns events about sharing and permissions', () => {
      const result = deriveFromRequirement('req-share', 'Users should be able to share documents', []);
      const eventNames = result.events.map((e) => e.name);
      expect(eventNames.length).toBeGreaterThanOrEqual(2);
      const hasShareEvent = eventNames.some(
        (n) => n.toLowerCase().includes('share') || n.toLowerCase().includes('document'),
      );
      expect(hasShareEvent).toBe(true);
    });
  });

  describe('Given "We need to integrate with Stripe for payments"', () => {
    it('returns payment events from domain patterns', () => {
      const result = deriveFromRequirement('req-stripe', 'We need to integrate with Stripe for payments', []);
      const eventNames = result.events.map((e) => e.name);
      // Should match the payment domain pattern
      expect(eventNames).toContain('PaymentInitiated');
      expect(eventNames).toContain('PaymentCompleted');
    });

    it('returns boundary assumptions about Stripe', () => {
      const result = deriveFromRequirement('req-stripe', 'We need to integrate with Stripe for payments', []);
      expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
      const stripeAssumption = result.assumptions.find(
        (a) => a.statement.toLowerCase().includes('stripe'),
      );
      expect(stripeAssumption).toBeDefined();
      expect(stripeAssumption!.type).toBe('contract');
    });
  });

  describe('Given "Send real-time notifications"', () => {
    it('returns notification events', () => {
      const result = deriveFromRequirement('req-notif', 'Send real-time notifications', []);
      const eventNames = result.events.map((e) => e.name);
      expect(eventNames.length).toBeGreaterThanOrEqual(1);
      const hasNotifEvent = eventNames.some((n) => n.toLowerCase().includes('notification'));
      expect(hasNotifEvent).toBe(true);
    });

    it('generates boundary assumption about notification delivery', () => {
      const result = deriveFromRequirement('req-notif', 'Send real-time notifications', []);
      expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
      const deliveryAssumption = result.assumptions.find(
        (a) => a.statement.toLowerCase().includes('notification'),
      );
      expect(deliveryAssumption).toBeDefined();
    });
  });

  describe('Given existing events', () => {
    it('filters out duplicate events', () => {
      const result = deriveFromRequirement(
        'req-pay',
        'We need payment processing',
        ['PaymentInitiated', 'PaymentCompleted'],
      );
      const eventNames = result.events.map((e) => e.name);
      expect(eventNames).not.toContain('PaymentInitiated');
      expect(eventNames).not.toContain('PaymentCompleted');
    });
  });

  describe('Confidence levels', () => {
    it('assigns LIKELY to domain pattern events', () => {
      const result = deriveFromRequirement('req-pay', 'We need payment processing', []);
      const patternEvents = result.events.filter((e) => e.name === 'PaymentInitiated');
      expect(patternEvents.length).toBe(1);
      expect(patternEvents[0].confidence).toBe('LIKELY');
    });

    it('assigns POSSIBLE to verb-noun extracted events', () => {
      const result = deriveFromRequirement('req-custom', 'Users create widgets', []);
      const extracted = result.events.filter((e) => e.name.includes('Widget'));
      expect(extracted.length).toBeGreaterThanOrEqual(1);
      expect(extracted[0].confidence).toBe('POSSIBLE');
    });

    it('assigns CONFIRMED to explicitly named events', () => {
      const result = deriveFromRequirement('req-explicit', 'We need a WidgetCreated event', []);
      const explicit = result.events.find((e) => e.name === 'WidgetCreated');
      expect(explicit).toBeDefined();
      expect(explicit!.confidence).toBe('CONFIRMED');
    });
  });

  describe('Given "Users need to create documents"', () => {
    it('generates document CRUD events from verb-noun extraction', () => {
      const result = deriveFromRequirement('req-docs', 'Users need to create documents', []);
      const eventNames = result.events.map((e) => e.name);
      expect(eventNames).toContain('DocumentCreated');
    });
  });

  describe('sourceRequirements', () => {
    it('all derived events have sourceRequirements populated', () => {
      const result = deriveFromRequirement('req-test', 'We need user authentication and payments', []);
      for (const event of result.events) {
        expect(event.sourceRequirements).toBeDefined();
        expect(event.sourceRequirements).toContain('req-test');
      }
    });
  });
});

describe('deriveFromRequirements (batch)', () => {
  it('processes multiple requirements', () => {
    const results = deriveFromRequirements(
      [
        { id: 'req-1', statement: 'We need payment processing' },
        { id: 'req-2', statement: 'Users should register accounts' },
      ],
      [],
    );
    expect(results).toHaveLength(2);
    expect(results[0].requirementId).toBe('req-1');
    expect(results[1].requirementId).toBe('req-2');
  });

  it('accumulates existing events across requirements to avoid duplicates', () => {
    const results = deriveFromRequirements(
      [
        { id: 'req-1', statement: 'We need user registration' },
        { id: 'req-2', statement: 'Users need to create accounts and register' },
      ],
      [],
    );
    // Collect all event names across both results
    const allNames = results.flatMap((r) => r.events.map((e) => e.name));
    const uniqueNames = new Set(allNames);
    expect(allNames.length).toBe(uniqueNames.size);
  });

  it('passes through pre-existing events', () => {
    const results = deriveFromRequirements(
      [{ id: 'req-1', statement: 'We need payment processing' }],
      ['PaymentInitiated'],
    );
    const eventNames = results[0].events.map((e) => e.name);
    expect(eventNames).not.toContain('PaymentInitiated');
  });
});
