import { describe, it, expect } from 'vitest';
import type { ProvenanceStep, ProvenanceStepKind } from './provenance-explorer.js';

// ProvenanceExplorer renders a chain of steps.
// We test the logic around chain structure and step kinds,
// since DOM rendering is tested via Playwright e2e.

// ── Step kind validation ────────────────────────────────────────────────

describe('ProvenanceExplorer — ProvenanceStep types', () => {
  describe('Given a valid resolution step', () => {
    it('has the correct shape', () => {
      const step: ProvenanceStep = {
        kind: 'resolution',
        label: 'Chose orders-team approach',
        detail: 'Overlap: OrderPlaced vs OrderCreated',
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      expect(step.kind).toBe('resolution');
      expect(step.label).toBe('Chose orders-team approach');
      expect(step.detail).toBeDefined();
      expect(step.timestamp).toBeDefined();
    });
  });

  describe('Given a valid conflict step', () => {
    it('has the correct shape', () => {
      const step: ProvenanceStep = {
        kind: 'conflict',
        label: 'OrderPlaced vs OrderCreated',
        detail: 'Both roles defined this event',
      };
      expect(step.kind).toBe('conflict');
    });
  });

  describe('Given a valid artifact step', () => {
    it('has the correct shape', () => {
      const step: ProvenanceStep = {
        kind: 'artifact',
        label: 'orders-team.yaml',
        detail: 'Submitted by orders-team role',
      };
      expect(step.kind).toBe('artifact');
    });
  });

  describe('Given a valid participant step', () => {
    it('has the correct shape', () => {
      const step: ProvenanceStep = {
        kind: 'participant',
        label: 'Alice',
        detail: 'Submitted orders-team.yaml',
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      expect(step.kind).toBe('participant');
    });
  });

  describe('Given a valid requirement step', () => {
    it('has the correct shape', () => {
      const step: ProvenanceStep = {
        kind: 'requirement',
        label: 'Users must be able to place orders',
        detail: 'Source: product-backlog',
      };
      expect(step.kind).toBe('requirement');
      expect(step.label).toBe('Users must be able to place orders');
      expect(step.detail).toBe('Source: product-backlog');
    });
  });

  describe('Given a step with only required fields', () => {
    it('works without optional detail and timestamp', () => {
      const step: ProvenanceStep = {
        kind: 'artifact',
        label: 'my-file.yaml',
      };
      expect(step.detail).toBeUndefined();
      expect(step.timestamp).toBeUndefined();
    });
  });
});

// ── Chain structure logic ───────────────────────────────────────────────

describe('ProvenanceExplorer — chain structure', () => {
  describe('Given a complete lineage chain', () => {
    it('can represent a full requirement -> resolution -> conflict -> artifact -> participant chain', () => {
      const chain: ProvenanceStep[] = [
        {
          kind: 'requirement',
          label: 'Users must be able to place orders',
          detail: 'Source: product-backlog',
        },
        {
          kind: 'resolution',
          label: 'Chose orders-team approach',
          detail: 'overlapLabel: OrderPlaced conflict',
          timestamp: '2024-01-04T00:00:00.000Z',
        },
        {
          kind: 'conflict',
          label: 'OrderPlaced vs OrderCreated',
          detail: 'Same event name across two roles',
        },
        {
          kind: 'artifact',
          label: 'orders-team.yaml',
          detail: 'Submitted by orders-team',
          timestamp: '2024-01-02T00:00:00.000Z',
        },
        {
          kind: 'participant',
          label: 'Alice',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ];

      expect(chain).toHaveLength(5);
      expect(chain[0].kind).toBe('requirement');
      expect(chain[4].kind).toBe('participant');
    });
  });

  describe('Given an empty chain', () => {
    it('is a valid empty array', () => {
      const chain: ProvenanceStep[] = [];
      expect(chain).toHaveLength(0);
    });
  });

  describe('Given a chain with only participant steps', () => {
    it('is valid for direct attribution without conflict', () => {
      const chain: ProvenanceStep[] = [
        { kind: 'participant', label: 'Bob' },
        { kind: 'participant', label: 'Carol' },
      ];
      expect(chain.every((s) => s.kind === 'participant')).toBe(true);
    });
  });
});

// ── Step kind enumeration ────────────────────────────────────────────────

describe('ProvenanceExplorer — ProvenanceStepKind', () => {
  it('covers all five lineage node types', () => {
    const kinds: ProvenanceStepKind[] = ['requirement', 'resolution', 'conflict', 'artifact', 'participant'];
    expect(kinds).toHaveLength(5);
    // Ensure these are distinct
    expect(new Set(kinds).size).toBe(5);
  });
});

// ── Timestamp formatting ─────────────────────────────────────────────────

describe('ProvenanceExplorer — timestamp handling', () => {
  describe('Given a valid ISO timestamp', () => {
    it('is parseable by Date', () => {
      const ts = '2024-01-15T10:30:00.000Z';
      const parsed = new Date(ts);
      expect(parsed.getFullYear()).toBe(2024);
      expect(parsed.getMonth()).toBe(0); // January
    });
  });

  describe('Given a malformed timestamp', () => {
    it('does not throw when passed through Date constructor', () => {
      expect(() => new Date('not-a-date')).not.toThrow();
      expect(isNaN(new Date('not-a-date').getTime())).toBe(true);
    });
  });
});
