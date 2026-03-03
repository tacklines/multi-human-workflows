import { describe, it, expect } from 'vitest';
import { suggestDecomposition } from './decomposition-heuristics.js';
import type { DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  name: string,
  aggregate: string,
  trigger: string,
): DomainEvent {
  return {
    name,
    aggregate,
    trigger,
    payload: [],
    integration: { direction: 'internal' },
    confidence: 'CONFIRMED',
  };
}

// ---------------------------------------------------------------------------
// complexityFromEventCount (tested indirectly through suggestDecomposition)
// ---------------------------------------------------------------------------

describe('complexity bucketing', () => {
  it('assigns S complexity for 1 event in a trigger group', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'user submits order')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('S');
  });

  it('assigns S complexity for 2 events in a trigger group', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user submits order'),
      makeEvent('OrderConfirmed', 'Order', 'user confirms order'),
    ];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('S');
  });

  it('assigns M complexity for 3 events', () => {
    const events = [
      makeEvent('A', 'Agg', 'user clicks button'),
      makeEvent('B', 'Agg', 'user presses enter'),
      makeEvent('C', 'Agg', 'user submits form'),
    ];
    // All three have distinct first words but share 'user' prefix -> user-initiated pattern
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('M');
  });

  it('assigns M complexity for 4 events', () => {
    const events = Array.from({ length: 4 }, (_, i) =>
      makeEvent(`Evt${i}`, 'Agg', `user action ${i}`),
    );
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('M');
  });

  it('assigns L complexity for 5 events', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent(`Evt${i}`, 'Agg', `user action ${i}`),
    );
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('L');
  });

  it('assigns L complexity for 6 events', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent(`Evt${i}`, 'Agg', `user action ${i}`),
    );
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('L');
  });

  it('assigns XL complexity for 7 or more events', () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      makeEvent(`Evt${i}`, 'Agg', `user action ${i}`),
    );
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].complexity).toBe('XL');
  });
});

// ---------------------------------------------------------------------------
// triggerPattern classification
// ---------------------------------------------------------------------------

describe('trigger pattern classification', () => {
  it('classifies "user ..." triggers as user-initiated', () => {
    const events = [makeEvent('UserLoggedIn', 'Auth', 'user logs in')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('user initiated');
  });

  it('classifies "customer ..." triggers as user-initiated', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'customer places order')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('user initiated');
  });

  it('classifies "admin ..." triggers as user-initiated', () => {
    const events = [makeEvent('UserBanned', 'User', 'admin bans account')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('user initiated');
  });

  it('classifies "system ..." triggers as system-driven', () => {
    const events = [makeEvent('InvoiceGenerated', 'Invoice', 'system generates invoice')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('system driven');
  });

  it('classifies "service ..." triggers as system-driven', () => {
    const events = [makeEvent('NotificationSent', 'Notification', 'service dispatches notification')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('system driven');
  });

  it('classifies "platform ..." triggers as system-driven', () => {
    const events = [makeEvent('AuditLogged', 'Audit', 'platform records audit entry')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('system driven');
  });

  it('classifies "timer ..." triggers as time-based', () => {
    const events = [makeEvent('SessionExpired', 'Session', 'timer expires session')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('time based');
  });

  it('classifies "schedule ..." triggers as time-based', () => {
    const events = [makeEvent('ReportGenerated', 'Report', 'schedule runs daily report')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('time based');
  });

  it('classifies "cron ..." triggers as time-based', () => {
    const events = [makeEvent('CacheInvalidated', 'Cache', 'cron job invalidates cache')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('time based');
  });

  it('classifies "periodic ..." triggers as time-based', () => {
    const events = [makeEvent('HeartbeatSent', 'Monitor', 'periodic health check fires')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('time based');
  });

  it('classifies "when ..." triggers as reactive', () => {
    const events = [makeEvent('AlertTriggered', 'Monitor', 'when threshold exceeded')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('reactive');
  });

  it('classifies "after ..." triggers as reactive', () => {
    const events = [makeEvent('FollowUpSent', 'Communication', 'after order ships')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('reactive');
  });

  it('classifies "on ..." triggers as reactive', () => {
    const events = [makeEvent('WebhookFired', 'Webhook', 'on payment received')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('reactive');
  });

  it('classifies "api ..." triggers as external-integration', () => {
    const events = [makeEvent('DataImported', 'Import', 'api call from partner')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('external integration');
  });

  it('classifies "webhook ..." triggers as external-integration', () => {
    const events = [makeEvent('PaymentReceived', 'Payment', 'webhook from payment provider')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('external integration');
  });

  it('classifies "external ..." triggers as external-integration', () => {
    const events = [makeEvent('StockUpdated', 'Inventory', 'external supplier update')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('external integration');
  });

  it('falls back to first word for unrecognised triggers', () => {
    const events = [makeEvent('FooHappened', 'Thing', 'magic happens unexpectedly')];
    const [suggestion] = suggestDecomposition(events);
    // first word is "magic" — title should contain it
    expect(suggestion.suggestedItems[0].title).toContain('magic');
  });

  it('is case-insensitive when classifying triggers', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'User places an order')];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems[0].title).toContain('user initiated');
  });
});

// ---------------------------------------------------------------------------
// Event grouping by trigger pattern
// ---------------------------------------------------------------------------

describe('event grouping by trigger pattern', () => {
  it('merges events with the same trigger pattern into one work item', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user places order'),
      makeEvent('OrderCancelled', 'Order', 'user cancels order'),
    ];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems).toHaveLength(1);
    expect(suggestion.suggestedItems[0].linkedEvents).toContain('OrderPlaced');
    expect(suggestion.suggestedItems[0].linkedEvents).toContain('OrderCancelled');
  });

  it('creates separate work items for different trigger patterns', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user places order'),
      makeEvent('InvoiceGenerated', 'Order', 'system generates invoice'),
    ];
    const [suggestion] = suggestDecomposition(events);
    expect(suggestion.suggestedItems).toHaveLength(2);
    const titles = suggestion.suggestedItems.map((i) => i.title);
    expect(titles.some((t) => t.includes('user initiated'))).toBe(true);
    expect(titles.some((t) => t.includes('system driven'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Linked events
// ---------------------------------------------------------------------------

describe('linkedEvents', () => {
  it('links event names, not aggregate names or triggers', () => {
    const events = [
      makeEvent('ItemAdded', 'Cart', 'user adds item to cart'),
      makeEvent('ItemRemoved', 'Cart', 'user removes item from cart'),
    ];
    const [suggestion] = suggestDecomposition(events);
    const { linkedEvents } = suggestion.suggestedItems[0];
    expect(linkedEvents).toEqual(expect.arrayContaining(['ItemAdded', 'ItemRemoved']));
    expect(linkedEvents).not.toContain('Cart');
    expect(linkedEvents).not.toContain('user adds item to cart');
  });
});

// ---------------------------------------------------------------------------
// Aggregate grouping and filtering
// ---------------------------------------------------------------------------

describe('aggregate grouping', () => {
  it('groups events from different aggregates into separate AggregateSuggestions', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user places order'),
      makeEvent('ItemAdded', 'Cart', 'user adds item'),
    ];
    const results = suggestDecomposition(events);
    expect(results).toHaveLength(2);
    const aggregates = results.map((r) => r.aggregate);
    expect(aggregates).toContain('Order');
    expect(aggregates).toContain('Cart');
  });

  it('sorts results by aggregate name alphabetically', () => {
    const events = [
      makeEvent('Zap', 'Zebra', 'user triggers zap'),
      makeEvent('Alpha', 'Apple', 'user triggers alpha'),
      makeEvent('Moo', 'Mango', 'user triggers moo'),
    ];
    const results = suggestDecomposition(events);
    const names = results.map((r) => r.aggregate);
    expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('filters to a specific aggregate when the aggregate parameter is provided', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user places order'),
      makeEvent('ItemAdded', 'Cart', 'user adds item'),
    ];
    const results = suggestDecomposition(events, 'Order');
    expect(results).toHaveLength(1);
    expect(results[0].aggregate).toBe('Order');
  });

  it('returns empty array when the specified aggregate does not exist', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'user places order')];
    const results = suggestDecomposition(events, 'NonExistent');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Happy path: typical aggregate with mixed events and trigger patterns
// ---------------------------------------------------------------------------

describe('happy path — typical aggregate with mixed events', () => {
  it('produces correct suggestions for a realistic Order aggregate', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user places order'),
      makeEvent('OrderCancelled', 'Order', 'user cancels order'),
      makeEvent('InvoiceGenerated', 'Order', 'system generates invoice'),
      makeEvent('PaymentReceived', 'Order', 'webhook from payment provider'),
    ];
    const [suggestion] = suggestDecomposition(events);

    expect(suggestion.aggregate).toBe('Order');
    // Three distinct trigger patterns: user-initiated, system-driven, external-integration
    expect(suggestion.suggestedItems).toHaveLength(3);

    const userItem = suggestion.suggestedItems.find((i) =>
      i.title.includes('user initiated'),
    );
    expect(userItem).toBeDefined();
    expect(userItem!.linkedEvents).toEqual(
      expect.arrayContaining(['OrderPlaced', 'OrderCancelled']),
    );
    expect(userItem!.complexity).toBe('S'); // 2 events

    const systemItem = suggestion.suggestedItems.find((i) =>
      i.title.includes('system driven'),
    );
    expect(systemItem).toBeDefined();
    expect(systemItem!.linkedEvents).toContain('InvoiceGenerated');
    expect(systemItem!.complexity).toBe('S'); // 1 event

    const externalItem = suggestion.suggestedItems.find((i) =>
      i.title.includes('external integration'),
    );
    expect(externalItem).toBeDefined();
    expect(externalItem!.linkedEvents).toContain('PaymentReceived');
  });

  it('description mentions all linked event names and the aggregate', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order', 'user places order'),
      makeEvent('OrderCancelled', 'Order', 'user cancels order'),
    ];
    const [suggestion] = suggestDecomposition(events);
    const { description } = suggestion.suggestedItems[0];
    expect(description).toContain('OrderPlaced');
    expect(description).toContain('OrderCancelled');
    expect(description).toContain('Order');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('returns empty array for empty events input', () => {
    const results = suggestDecomposition([]);
    expect(results).toHaveLength(0);
  });

  it('handles a single event correctly', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'user places order')];
    const results = suggestDecomposition(events);
    expect(results).toHaveLength(1);
    expect(results[0].aggregate).toBe('Order');
    expect(results[0].suggestedItems).toHaveLength(1);
    expect(results[0].suggestedItems[0].complexity).toBe('S');
    expect(results[0].suggestedItems[0].linkedEvents).toEqual(['OrderPlaced']);
  });

  it('handles a trigger with a single word (no spaces)', () => {
    const events = [makeEvent('Fired', 'Gun', 'bang')];
    const [suggestion] = suggestDecomposition(events);
    // Falls back to first word: "bang"
    expect(suggestion.suggestedItems[0].title).toContain('bang');
  });

  it('handles events with an empty trigger string gracefully', () => {
    // Empty string: split gives [''], first word is '', toLowerCase = ''
    const events = [makeEvent('Mystery', 'Agg', '')];
    const results = suggestDecomposition(events);
    expect(results).toHaveLength(1);
    expect(results[0].suggestedItems).toHaveLength(1);
  });

  it('does not mutate the input events array', () => {
    const events = [makeEvent('OrderPlaced', 'Order', 'user places order')];
    const original = [...events];
    suggestDecomposition(events);
    expect(events).toEqual(original);
  });
});
