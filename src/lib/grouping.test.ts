import { describe, it, expect } from 'vitest';
import { getAllAggregates, groupByAggregate } from './grouping.js';
import type { LoadedFile, DomainEvent } from '../schema/types.js';

function makeEvent(name: string, aggregate: string): DomainEvent {
  return {
    name,
    aggregate,
    trigger: 'command',
    payload: [],
    integration: { direction: 'inbound' as const },
    confidence: 'CONFIRMED' as const,
  };
}

function makeFile(events: DomainEvent[]): LoadedFile {
  return {
    filename: 'test.yaml',
    role: 'developer',
    data: {
      metadata: {
        role: 'developer',
        scope: 'test',
        goal: 'testing',
        generated_at: '2026-01-01T00:00:00Z',
        event_count: events.length,
        assumption_count: 0,
      },
      domain_events: events,
      boundary_assumptions: [],
    },
  };
}

describe('getAllAggregates', () => {
  it('returns sorted unique aggregates across multiple files', () => {
    const file1 = makeFile([makeEvent('e1', 'Order'), makeEvent('e2', 'Billing')]);
    const file2 = makeFile([makeEvent('e3', 'Order'), makeEvent('e4', 'Account')]);

    const result = getAllAggregates([file1, file2]);
    expect(result).toEqual(['Account', 'Billing', 'Order']);
  });

  it('returns empty array for empty files', () => {
    expect(getAllAggregates([])).toEqual([]);
    expect(getAllAggregates([makeFile([])])).toEqual([]);
  });
});

describe('groupByAggregate', () => {
  it('correctly groups events by aggregate', () => {
    const events = [
      makeEvent('OrderPlaced', 'Order'),
      makeEvent('InvoiceSent', 'Billing'),
      makeEvent('OrderShipped', 'Order'),
    ];

    const groups = groupByAggregate(events);
    expect(groups.size).toBe(2);
    expect(groups.get('Order')?.map(e => e.name)).toEqual(['OrderPlaced', 'OrderShipped']);
    expect(groups.get('Billing')?.map(e => e.name)).toEqual(['InvoiceSent']);
  });

  it('preserves event order within groups', () => {
    const events = [
      makeEvent('First', 'A'),
      makeEvent('Second', 'A'),
      makeEvent('Third', 'A'),
    ];

    const groups = groupByAggregate(events);
    expect(groups.get('A')?.map(e => e.name)).toEqual(['First', 'Second', 'Third']);
  });
});
