import { describe, it, expect } from 'vitest';
import { ContractService } from '../../contexts/contract/index.js';
import type { ContractBundle } from '../../schema/types.js';

// ContractDiff component renders the output of ContractService.diff().
// We test the diff computation and the component's decision logic for
// categorising changes (since DOM rendering is tested via Playwright e2e).

// ── Helpers ─────────────────────────────────────────────────────────────

function makeBundle(overrides: Partial<ContractBundle> = {}): ContractBundle {
  return {
    generatedAt: '2024-01-01T00:00:00.000Z',
    sourceJamCode: 'TEST01',
    eventContracts: [
      {
        eventName: 'OrderPlaced',
        aggregate: 'Order',
        version: '1.0.0',
        schema: { orderId: { type: 'string' }, amount: { type: 'number' } },
        owner: 'orders-team',
        consumers: ['fulfillment-team'],
        producedBy: 'orders-team',
      },
    ],
    boundaryContracts: [
      {
        boundaryName: 'orders-team',
        aggregates: ['Order'],
        events: ['OrderPlaced'],
        owner: 'orders-team',
        externalDependencies: [],
      },
    ],
    ...overrides,
  };
}

const service = new ContractService(() => null);

// ── change-type classification ──────────────────────────────────────────

describe('ContractDiff — change-type classification', () => {
  describe('When before and after are identical', () => {
    it('produces no changes', () => {
      const bundle = makeBundle();
      const diff = service.diff(bundle, bundle);
      expect(diff.changes).toHaveLength(0);
    });
  });

  describe('When a new event contract is added', () => {
    it('classifies the change as "added"', () => {
      const before = makeBundle({ eventContracts: [] });
      const after = makeBundle();
      const diff = service.diff(before, after);
      const change = diff.changes.find((c) => c.name === 'OrderPlaced');
      expect(change?.type).toBe('added');
    });

    it('includes the owner in the change description', () => {
      const before = makeBundle({ eventContracts: [] });
      const after = makeBundle();
      const diff = service.diff(before, after);
      const change = diff.changes.find((c) => c.name === 'OrderPlaced');
      expect(change?.description).toMatch(/orders-team/);
    });
  });

  describe('When an event contract is removed', () => {
    it('classifies the change as "removed"', () => {
      const before = makeBundle();
      const after = makeBundle({ eventContracts: [] });
      const diff = service.diff(before, after);
      const change = diff.changes.find((c) => c.name === 'OrderPlaced');
      expect(change?.type).toBe('removed');
    });
  });

  describe('When an event contract schema changes', () => {
    it('classifies the change as "modified"', () => {
      const before = makeBundle();
      const after = makeBundle({
        eventContracts: [
          {
            eventName: 'OrderPlaced',
            aggregate: 'Order',
            version: '1.0.0',
            schema: { orderId: { type: 'string' } }, // removed 'amount' field
            owner: 'orders-team',
            consumers: ['fulfillment-team'],
            producedBy: 'orders-team',
          },
        ],
      });
      const diff = service.diff(before, after);
      expect(diff.modifiedEvents).toContain('OrderPlaced');
      const change = diff.changes.find((c) => c.type === 'modified');
      expect(change?.description).toMatch(/schema changed/);
    });
  });

  describe('When a boundary contract is added', () => {
    it('classifies the change as "added" with kind "boundaryContract"', () => {
      const before = makeBundle({ boundaryContracts: [] });
      const after = makeBundle();
      const diff = service.diff(before, after);
      const change = diff.changes.find((c) => c.kind === 'boundaryContract');
      expect(change?.type).toBe('added');
    });
  });

  describe('When a boundary contract aggregates change', () => {
    it('classifies the change as "modified"', () => {
      const before = makeBundle();
      const after = makeBundle({
        boundaryContracts: [
          {
            boundaryName: 'orders-team',
            aggregates: ['Order', 'Shipment'],
            events: ['OrderPlaced'],
            owner: 'orders-team',
            externalDependencies: [],
          },
        ],
      });
      const diff = service.diff(before, after);
      expect(diff.modifiedBoundaries).toContain('orders-team');
      const change = diff.changes.find((c) => c.kind === 'boundaryContract' && c.type === 'modified');
      expect(change?.description).toMatch(/aggregates changed/);
    });
  });
});

// ── counts ──────────────────────────────────────────────────────────────

describe('ContractDiff — change counts', () => {
  it('tracks addedEvents, removedEvents, modifiedEvents separately', () => {
    const v1 = makeBundle({
      eventContracts: [
        { eventName: 'OrderPlaced', aggregate: 'Order', version: '1.0.0', schema: {}, owner: 'a', consumers: [], producedBy: 'a' },
        { eventName: 'OrderCancelled', aggregate: 'Order', version: '1.0.0', schema: {}, owner: 'a', consumers: [], producedBy: 'a' },
      ],
      boundaryContracts: [],
    });
    const v2 = makeBundle({
      eventContracts: [
        { eventName: 'OrderPlaced', aggregate: 'Order', version: '2.0.0', schema: {}, owner: 'a', consumers: [], producedBy: 'a' }, // modified
        { eventName: 'OrderShipped', aggregate: 'Order', version: '1.0.0', schema: {}, owner: 'b', consumers: [], producedBy: 'b' }, // added
        // OrderCancelled is removed
      ],
      boundaryContracts: [],
    });

    const diff = service.diff(v1, v2);

    expect(diff.addedEvents).toContain('OrderShipped');
    expect(diff.removedEvents).toContain('OrderCancelled');
    expect(diff.modifiedEvents).toContain('OrderPlaced');
    expect(diff.changes).toHaveLength(3);
  });

  it('returns empty arrays for all counts when bundles are identical', () => {
    const bundle = makeBundle();
    const diff = service.diff(bundle, bundle);

    expect(diff.addedEvents).toHaveLength(0);
    expect(diff.removedEvents).toHaveLength(0);
    expect(diff.modifiedEvents).toHaveLength(0);
    expect(diff.addedBoundaries).toHaveLength(0);
    expect(diff.removedBoundaries).toHaveLength(0);
    expect(diff.modifiedBoundaries).toHaveLength(0);
  });
});

// ── consumers change detection ───────────────────────────────────────────

describe('ContractDiff — consumers change detection', () => {
  it('detects modified contract when consumers are added', () => {
    const before = makeBundle({
      eventContracts: [
        { eventName: 'OrderPlaced', aggregate: 'Order', version: '1.0.0', schema: {}, owner: 'a', consumers: [], producedBy: 'a' },
      ],
      boundaryContracts: [],
    });
    const after = makeBundle({
      eventContracts: [
        { eventName: 'OrderPlaced', aggregate: 'Order', version: '1.0.0', schema: {}, owner: 'a', consumers: ['b'], producedBy: 'a' },
      ],
      boundaryContracts: [],
    });

    const diff = service.diff(before, after);

    expect(diff.modifiedEvents).toContain('OrderPlaced');
    const change = diff.changes.find((c) => c.name === 'OrderPlaced');
    expect(change?.description).toMatch(/consumers changed/);
  });
});
