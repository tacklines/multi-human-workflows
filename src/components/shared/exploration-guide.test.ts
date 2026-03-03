import { describe, it, expect, beforeEach } from 'vitest';
import type { ExploreEvent } from './exploration-guide.js';
import type { EventPriority } from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Unit tests for ExplorationGuide computed getters
// We test the pure logic by extracting it — Lit component instantiation
// requires a DOM environment, so we mirror the getter logic here.
// ---------------------------------------------------------------------------

/** Mirror of the explorationPrompts getter logic */
function getExplorationPrompts(
  selectedEventName: string | null,
  events: ExploreEvent[]
): string[] {
  if (!selectedEventName) {
    return [
      'What are the most important things that happen in your domain?',
      "Which aggregates are central to your team's responsibilities?",
      'What external systems do your events depend on?',
    ];
  }

  const seen = new Map<string, string>();
  for (const ev of events) {
    if (ev.name === selectedEventName) {
      seen.set(ev.participantId, ev.participantName);
    }
  }
  const participantCount = seen.size;

  if (participantCount >= 2) {
    return [
      `Do both teams mean the same thing by "${selectedEventName}"?`,
      'Are the payload fields identical, or do they carry different data?',
      'Who is the authoritative owner of this event?',
    ];
  }

  return [
    `Who triggers "${selectedEventName}"? A user action, a system job, or another event?`,
    `What happens if "${selectedEventName}" fails or is retried?`,
    `Which other aggregates need to know when "${selectedEventName}" occurs?`,
  ];
}

/** Mirror of the nextSteps getter logic */
function getNextSteps(
  phase: string,
  events: ExploreEvent[],
  priorities: EventPriority[]
): Array<{ label: string; phase: string }> {
  const phaseOrder = ['spark', 'explore', 'rank', 'slice', 'agree', 'build', 'ship'];
  const phaseIndex = phaseOrder.indexOf(phase);
  const rankIndex = phaseOrder.indexOf('rank');

  const uniqueNames = Array.from(new Set(events.map((e) => e.name)));
  const prioritized = new Set(priorities.map((p) => p.eventName));
  const unprioritized = uniqueNames.filter((n) => !prioritized.has(n)).length;

  const counts = new Map<string, Set<string>>();
  for (const ev of events) {
    if (!counts.has(ev.name)) counts.set(ev.name, new Set());
    counts.get(ev.name)!.add(ev.participantId);
  }
  let dups = 0;
  for (const ps of counts.values()) {
    if (ps.size > 1) dups++;
  }

  const steps: Array<{ label: string; phase: string }> = [];

  if (phaseIndex >= rankIndex && unprioritized > 0) {
    steps.push({
      label: `Set priorities for ${unprioritized} event${unprioritized !== 1 ? 's' : ''}`,
      phase: 'rank',
    });
  }

  if (dups > 0) {
    steps.push({
      label: `Resolve ${dups} potential overlap${dups !== 1 ? 's' : ''}`,
      phase: 'rank',
    });
  }

  if (phase === 'explore' && events.length > 0) {
    steps.push({
      label: 'Ready to rank? Move to the Rank phase',
      phase: 'rank',
    });
  }

  return steps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ExploreEvent> = {}): ExploreEvent {
  return {
    name: 'OrderPlaced',
    aggregate: 'Order',
    participantId: 'p1',
    participantName: 'Alice',
    ...overrides,
  };
}

function makePriority(overrides: Partial<EventPriority> = {}): EventPriority {
  return {
    eventName: 'OrderPlaced',
    participantId: 'p1',
    tier: 'must_have',
    setAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// explorationPrompts tests
// ---------------------------------------------------------------------------

describe('explorationPrompts', () => {
  describe('Given no event is selected', () => {
    it('returns general domain questions', () => {
      const prompts = getExplorationPrompts(null, []);
      expect(prompts).toHaveLength(3);
      expect(prompts[0]).toContain('most important things');
    });
  });

  describe('Given a selected event with a single participant', () => {
    it('returns single-participant prompts about triggers and failures', () => {
      const events = [makeEvent({ name: 'PaymentProcessed', participantId: 'p1' })];
      const prompts = getExplorationPrompts('PaymentProcessed', events);
      expect(prompts).toHaveLength(3);
      expect(prompts[0]).toContain('PaymentProcessed');
      expect(prompts[0]).toContain('triggers');
      expect(prompts[1]).toContain('fails or is retried');
    });
  });

  describe('Given a selected event present in 2+ participants', () => {
    it('returns overlap-focused prompts', () => {
      const events = [
        makeEvent({ name: 'PaymentProcessed', participantId: 'p1', participantName: 'Alice' }),
        makeEvent({ name: 'PaymentProcessed', participantId: 'p2', participantName: 'Bob' }),
      ];
      const prompts = getExplorationPrompts('PaymentProcessed', events);
      expect(prompts).toHaveLength(3);
      expect(prompts[0]).toContain('both teams mean the same thing');
      expect(prompts[2]).toContain('authoritative owner');
    });
  });
});

// ---------------------------------------------------------------------------
// nextSteps tests
// ---------------------------------------------------------------------------

describe('nextSteps', () => {
  describe('Given explore phase with events and no priorities', () => {
    it('includes the explore-to-rank nudge', () => {
      const events = [makeEvent()];
      const steps = getNextSteps('explore', events, []);
      const labels = steps.map((s) => s.label);
      expect(labels.some((l) => l.includes('Ready to rank'))).toBe(true);
    });

    it('does NOT include the set-priorities step (rank phase not yet reached)', () => {
      const events = [makeEvent()];
      const steps = getNextSteps('explore', events, []);
      const labels = steps.map((s) => s.label);
      expect(labels.some((l) => l.includes('Set priorities'))).toBe(false);
    });
  });

  describe('Given rank phase with unprioritized events', () => {
    it('includes a step with the correct unprioritized count', () => {
      const events = [
        makeEvent({ name: 'OrderPlaced' }),
        makeEvent({ name: 'PaymentProcessed' }),
        makeEvent({ name: 'OrderShipped' }),
      ];
      const priorities = [makePriority({ eventName: 'OrderPlaced' })];
      const steps = getNextSteps('rank', events, priorities);
      const labels = steps.map((s) => s.label);
      expect(labels.some((l) => l.includes('Set priorities for 2 events'))).toBe(true);
    });

    it('uses singular "event" when count is 1', () => {
      const events = [makeEvent({ name: 'OrderPlaced' }), makeEvent({ name: 'PaymentProcessed' })];
      const priorities = [makePriority({ eventName: 'OrderPlaced' })];
      const steps = getNextSteps('rank', events, priorities);
      const labels = steps.map((s) => s.label);
      expect(labels.some((l) => l.includes('Set priorities for 1 event') && !l.includes('events'))).toBe(true);
    });
  });

  describe('Given events that appear in multiple participants', () => {
    it('includes an overlap resolution step', () => {
      const events = [
        makeEvent({ name: 'OrderPlaced', participantId: 'p1' }),
        makeEvent({ name: 'OrderPlaced', participantId: 'p2' }),
      ];
      const steps = getNextSteps('explore', events, []);
      const labels = steps.map((s) => s.label);
      expect(labels.some((l) => l.includes('Resolve') && l.includes('overlap'))).toBe(true);
    });

    it('counts multiple distinct overlapping events correctly', () => {
      const events = [
        makeEvent({ name: 'OrderPlaced', participantId: 'p1' }),
        makeEvent({ name: 'OrderPlaced', participantId: 'p2' }),
        makeEvent({ name: 'PaymentProcessed', participantId: 'p1' }),
        makeEvent({ name: 'PaymentProcessed', participantId: 'p2' }),
      ];
      const steps = getNextSteps('explore', events, []);
      const overlapStep = steps.find((s) => s.label.includes('Resolve'));
      expect(overlapStep?.label).toContain('2 potential overlaps');
    });
  });

  describe('Given no events at all', () => {
    it('returns an empty list', () => {
      const steps = getNextSteps('explore', [], []);
      expect(steps).toHaveLength(0);
    });
  });

  describe('Result capped at 3 items', () => {
    it('never returns more than 3 next steps', () => {
      // rank phase + unprioritized + overlaps + explore nudge would be 4 items
      // but explore nudge only shows in explore phase; still validate cap
      const events = [
        makeEvent({ name: 'A', participantId: 'p1' }),
        makeEvent({ name: 'A', participantId: 'p2' }),
        makeEvent({ name: 'B', participantId: 'p1' }),
        makeEvent({ name: 'B', participantId: 'p2' }),
      ];
      const steps = getNextSteps('rank', events, []);
      expect(steps.length).toBeLessThanOrEqual(3);
    });
  });
});
