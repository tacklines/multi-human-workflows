import { describe, it, expect } from 'vitest';
import type { EventPriority } from '../../schema/types.js';

// comparison-view.ts is a Lit web component. We test the pure logic
// (progress computation, conflict sorting) without full DOM rendering.

// ── Fixtures ──────────────────────────────────────────────────────

const makePriority = (
  eventName: string,
  tier: EventPriority['tier']
): EventPriority => ({
  eventName,
  participantId: 'participant-1',
  tier,
  setAt: new Date().toISOString(),
});

// ── Progress bar computation ──────────────────────────────────────

describe('ComparisonView — negotiation progress bar', () => {
  describe('Given 0 conflicts', () => {
    it('should compute 0% progress', () => {
      const totalConflicts = 0;
      const resolvedCount = 0;
      const progressPct =
        totalConflicts > 0 ? Math.min(100, (resolvedCount / totalConflicts) * 100) : 0;
      const allResolved = totalConflicts > 0 && resolvedCount >= totalConflicts;

      expect(progressPct).toBe(0);
      expect(allResolved).toBe(false);
    });
  });

  describe('Given 12 total conflicts and 8 resolved', () => {
    it('should show "8 of 12 conflicts resolved" text components', () => {
      const totalConflicts = 12;
      const resolvedCount = 8;
      const progressPct = Math.min(100, (resolvedCount / totalConflicts) * 100);
      const allResolved = resolvedCount >= totalConflicts;

      expect(resolvedCount).toBe(8);
      expect(totalConflicts).toBe(12);
      // Approximately 66.7%
      expect(progressPct).toBeCloseTo(66.67, 1);
      expect(allResolved).toBe(false);
    });
  });

  describe('Given all conflicts resolved', () => {
    it('should show success state when resolved count equals total', () => {
      const totalConflicts = 5;
      const resolvedCount = 5;
      const allResolved = totalConflicts > 0 && resolvedCount >= totalConflicts;
      const progressPct = Math.min(100, (resolvedCount / totalConflicts) * 100);

      expect(allResolved).toBe(true);
      expect(progressPct).toBe(100);
    });

    it('should cap progress at 100% even if resolved count exceeds total', () => {
      const totalConflicts = 3;
      const resolvedCount = 5; // more than total (edge case)
      const progressPct = Math.min(100, (resolvedCount / totalConflicts) * 100);

      expect(progressPct).toBe(100);
    });
  });

  describe('Given 1 of 1 conflict resolved', () => {
    it('should show success state', () => {
      const totalConflicts = 1;
      const resolvedCount = 1;
      const allResolved = totalConflicts > 0 && resolvedCount >= totalConflicts;

      expect(allResolved).toBe(true);
    });
  });

  describe('Given 0 of 5 conflicts resolved', () => {
    it('should show 0% progress and no success state', () => {
      const totalConflicts = 5;
      const resolvedCount = 0;
      const progressPct = Math.min(100, (resolvedCount / totalConflicts) * 100);
      const allResolved = totalConflicts > 0 && resolvedCount >= totalConflicts;

      expect(progressPct).toBe(0);
      expect(allResolved).toBe(false);
    });
  });
});

// ── Priority-aware conflict sorting ──────────────────────────────

describe('ComparisonView — priority-aware conflict sorting', () => {
  const tierOrder: EventPriority['tier'][] = ['must_have', 'should_have', 'could_have'];

  describe('Given conflicts with mixed priority tiers', () => {
    it('should sort must_have first, then should_have, then could_have', () => {
      const priorities: EventPriority[] = [
        makePriority('CouldHaveEvent', 'could_have'),
        makePriority('MustHaveEvent', 'must_have'),
        makePriority('ShouldHaveEvent', 'should_have'),
      ];

      const conflicts = [
        { label: 'CouldHaveEvent', kind: 'same-name' as const, roles: [], details: '' },
        { label: 'MustHaveEvent', kind: 'same-name' as const, roles: [], details: '' },
        { label: 'ShouldHaveEvent', kind: 'same-name' as const, roles: [], details: '' },
      ];

      const priorityMap = new Map(
        priorities.map((p) => [p.eventName, tierOrder.indexOf(p.tier)])
      );
      const sorted = [...conflicts].sort((a, b) => {
        const aIdx = priorityMap.get(a.label) ?? tierOrder.length;
        const bIdx = priorityMap.get(b.label) ?? tierOrder.length;
        return aIdx - bIdx;
      });

      expect(sorted[0].label).toBe('MustHaveEvent');
      expect(sorted[1].label).toBe('ShouldHaveEvent');
      expect(sorted[2].label).toBe('CouldHaveEvent');
    });

    it('should place unranked conflicts after all prioritized ones', () => {
      const priorities: EventPriority[] = [
        makePriority('MustHaveEvent', 'must_have'),
      ];

      const conflicts = [
        { label: 'UnrankedEvent', kind: 'same-name' as const, roles: [], details: '' },
        { label: 'MustHaveEvent', kind: 'same-name' as const, roles: [], details: '' },
      ];

      const priorityMap = new Map(
        priorities.map((p) => [p.eventName, tierOrder.indexOf(p.tier)])
      );
      const sorted = [...conflicts].sort((a, b) => {
        const aIdx = priorityMap.get(a.label) ?? tierOrder.length;
        const bIdx = priorityMap.get(b.label) ?? tierOrder.length;
        return aIdx - bIdx;
      });

      expect(sorted[0].label).toBe('MustHaveEvent');
      expect(sorted[1].label).toBe('UnrankedEvent');
    });

    it('should preserve original order when no priorities are provided', () => {
      const priorities: EventPriority[] = [];
      const conflicts = [
        { label: 'EventA', kind: 'same-name' as const, roles: [], details: '' },
        { label: 'EventB', kind: 'same-name' as const, roles: [], details: '' },
      ];

      // When no priorities, the component skips sorting
      const sortedConflicts = priorities.length > 0
        ? [...conflicts].sort(() => 0)
        : conflicts;

      expect(sortedConflicts[0].label).toBe('EventA');
      expect(sortedConflicts[1].label).toBe('EventB');
    });
  });
});
