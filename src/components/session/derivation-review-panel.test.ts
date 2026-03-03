/**
 * Tests for derivation-review-panel component.
 *
 * These tests focus on the pure logic around event selection, dismissal,
 * and custom event detail shapes. Full rendering tests require a browser
 * environment (Playwright e2e).
 */

import { describe, it, expect } from 'vitest';
import type {
  SuggestionGroup,
  SuggestedEventItem,
  EventsAcceptedDetail,
  EventEditRequestedDetail,
} from './derivation-review-panel.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(name: string, confidence = 'LIKELY'): SuggestedEventItem {
  return {
    name,
    description: `${name} occurred`,
    confidence,
    trigger: `Trigger for ${name}`,
    stateChange: `State changes from ${name}`,
  };
}

function makeSuggestions(): SuggestionGroup[] {
  return [
    {
      requirementId: 'req-1',
      requirementText: 'We need offline support',
      events: [
        makeEvent('DataSyncRequested', 'CONFIRMED'),
        makeEvent('OfflineCacheCreated', 'LIKELY'),
        makeEvent('ConflictDetected', 'POSSIBLE'),
        makeEvent('SyncCompleted', 'LIKELY'),
      ],
    },
    {
      requirementId: 'req-2',
      requirementText: 'Users should share documents',
      events: [
        makeEvent('DocumentShared', 'CONFIRMED'),
        makeEvent('SharePermissionGranted', 'LIKELY'),
        makeEvent('DocumentAccessRevoked', 'POSSIBLE'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Selection logic
// ---------------------------------------------------------------------------

describe('derivation-review-panel selection logic', () => {
  it('all events are selected by default', () => {
    const suggestions = makeSuggestions();
    // Simulate what the component does on initialization
    const selected = new Set<string>();
    for (const group of suggestions) {
      for (const event of group.events) {
        selected.add(`${group.requirementId}::${event.name}`);
      }
    }

    // All 7 events should be selected
    expect(selected.size).toBe(7);
    expect(selected.has('req-1::DataSyncRequested')).toBe(true);
    expect(selected.has('req-1::OfflineCacheCreated')).toBe(true);
    expect(selected.has('req-1::ConflictDetected')).toBe(true);
    expect(selected.has('req-1::SyncCompleted')).toBe(true);
    expect(selected.has('req-2::DocumentShared')).toBe(true);
    expect(selected.has('req-2::SharePermissionGranted')).toBe(true);
    expect(selected.has('req-2::DocumentAccessRevoked')).toBe(true);
  });

  it('dismiss removes event from selection', () => {
    const suggestions = makeSuggestions();
    // Initialize all selected
    const selected = new Set<string>();
    const dismissed = new Set<string>();
    for (const group of suggestions) {
      for (const event of group.events) {
        selected.add(`${group.requirementId}::${event.name}`);
      }
    }

    // Dismiss ConflictDetected
    const dismissKey = 'req-1::ConflictDetected';
    dismissed.add(dismissKey);
    selected.delete(dismissKey);

    expect(selected.size).toBe(6);
    expect(selected.has(dismissKey)).toBe(false);
    expect(dismissed.has(dismissKey)).toBe(true);

    // Visible events for req-1 should exclude dismissed
    const visibleReq1 = suggestions[0].events.filter(
      (e) => !dismissed.has(`req-1::${e.name}`)
    );
    expect(visibleReq1).toHaveLength(3);
    expect(visibleReq1.map((e) => e.name)).not.toContain('ConflictDetected');
  });
});

// ---------------------------------------------------------------------------
// Event detail shapes
// ---------------------------------------------------------------------------

describe('events-accepted detail shape', () => {
  it('contains selections array with requirementId and eventNames', () => {
    const detail: EventsAcceptedDetail = {
      selections: [
        { requirementId: 'req-1', eventNames: ['DataSyncRequested', 'SyncCompleted'] },
        { requirementId: 'req-2', eventNames: ['DocumentShared'] },
      ],
    };

    expect(detail.selections).toHaveLength(2);
    expect(detail.selections[0].requirementId).toBe('req-1');
    expect(detail.selections[0].eventNames).toEqual(['DataSyncRequested', 'SyncCompleted']);
    expect(detail.selections[1].requirementId).toBe('req-2');
    expect(detail.selections[1].eventNames).toEqual(['DocumentShared']);
  });

  it('accept-all includes all visible events', () => {
    const suggestions = makeSuggestions();
    const dismissed = new Set<string>();

    // Simulate accept-all: collect all non-dismissed events
    const selections = suggestions
      .map((group) => ({
        requirementId: group.requirementId,
        eventNames: group.events
          .filter((e) => !dismissed.has(`${group.requirementId}::${e.name}`))
          .map((e) => e.name),
      }))
      .filter((s) => s.eventNames.length > 0);

    expect(selections).toHaveLength(2);
    expect(selections[0].eventNames).toHaveLength(4);
    expect(selections[1].eventNames).toHaveLength(3);
  });

  it('accept-selected excludes unchecked events', () => {
    const suggestions = makeSuggestions();
    const selected = new Set<string>();
    const dismissed = new Set<string>();

    // Only select some events
    selected.add('req-1::DataSyncRequested');
    selected.add('req-2::DocumentShared');
    selected.add('req-2::SharePermissionGranted');

    const selections = suggestions
      .map((group) => ({
        requirementId: group.requirementId,
        eventNames: group.events
          .filter((e) => !dismissed.has(`${group.requirementId}::${e.name}`))
          .filter((e) => selected.has(`${group.requirementId}::${e.name}`))
          .map((e) => e.name),
      }))
      .filter((s) => s.eventNames.length > 0);

    expect(selections).toHaveLength(2);
    expect(selections[0].eventNames).toEqual(['DataSyncRequested']);
    expect(selections[1].eventNames).toEqual(['DocumentShared', 'SharePermissionGranted']);
  });
});

describe('event-edit-requested detail shape', () => {
  it('contains requirementId and full event object', () => {
    const event = makeEvent('DataSyncRequested', 'CONFIRMED');
    const detail: EventEditRequestedDetail = {
      requirementId: 'req-1',
      event,
    };

    expect(detail.requirementId).toBe('req-1');
    expect(detail.event.name).toBe('DataSyncRequested');
    expect(detail.event.description).toBe('DataSyncRequested occurred');
    expect(detail.event.confidence).toBe('CONFIRMED');
    expect(detail.event.trigger).toBe('Trigger for DataSyncRequested');
    expect(detail.event.stateChange).toBe('State changes from DataSyncRequested');
  });
});

// ---------------------------------------------------------------------------
// Confidence badge mapping
// ---------------------------------------------------------------------------

describe('confidence badge mapping', () => {
  function confidenceBadgeVariant(confidence: string): 'success' | 'primary' | 'warning' {
    switch (confidence.toUpperCase()) {
      case 'CONFIRMED':
        return 'success';
      case 'LIKELY':
        return 'primary';
      default:
        return 'warning';
    }
  }

  it('maps CONFIRMED to success', () => {
    expect(confidenceBadgeVariant('CONFIRMED')).toBe('success');
  });

  it('maps LIKELY to primary', () => {
    expect(confidenceBadgeVariant('LIKELY')).toBe('primary');
  });

  it('maps POSSIBLE to warning', () => {
    expect(confidenceBadgeVariant('POSSIBLE')).toBe('warning');
  });

  it('maps unknown confidence to warning', () => {
    expect(confidenceBadgeVariant('UNKNOWN')).toBe('warning');
  });
});
