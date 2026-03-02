import type { DomainEvent, EventPriority } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Priority heuristics — suggest MoSCoW tiers for domain events based on
// event characteristics such as confidence, payload richness, integration
// direction, and whether they appear in multiple submitted files.
//
// Pure function: no side effects, no DOM dependencies.
// ---------------------------------------------------------------------------

export interface PrioritySuggestionResult {
  eventName: string;
  suggestedTier: 'must_have' | 'should_have' | 'could_have';
  reason: string;
  /** Confidence in this suggestion, 0–100. Only results >= 60 are returned. */
  confidence: number;
}

/**
 * Suggest MoSCoW priority tiers for domain events that do not yet have an
 * explicit priority set.
 *
 * Heuristic rules (applied in order, highest confidence wins):
 *
 * 1. Events with confidence 'CONFIRMED' and 3+ payload fields → must_have (85)
 * 2. Events with a cross-boundary integration channel set → must_have or
 *    should_have depending on direction (80)
 * 3. Events that appear in multiple files (crossRefs > 1) → one tier bump (75)
 * 4. Events with confidence 'POSSIBLE' → could_have (65)
 * 5. Events with confidence 'LIKELY' and no channel → should_have (62)
 *
 * Only suggestions with confidence > 60 are returned.
 * Events that already have a priority in `existingPriorities` are skipped.
 *
 * @param events             All domain events from submitted prep files.
 * @param existingPriorities Already-set priorities — these events are skipped.
 */
export function suggestPriorities(
  events: DomainEvent[],
  existingPriorities: EventPriority[]
): PrioritySuggestionResult[] {
  if (events.length === 0) return [];

  // Build set of event names that already have priorities (skip these)
  const prioritisedNames = new Set(existingPriorities.map((p) => p.eventName));

  // Count how many times each event name appears across all events (crossRefs)
  // Since `events` may be a flat list from multiple files, duplicates indicate
  // multiple files referencing the same event.
  const crossRefCounts = new Map<string, number>();
  for (const ev of events) {
    crossRefCounts.set(ev.name, (crossRefCounts.get(ev.name) ?? 0) + 1);
  }

  // Deduplicate — first occurrence wins
  const seen = new Set<string>();
  const uniqueEvents: DomainEvent[] = [];
  for (const ev of events) {
    if (!seen.has(ev.name)) {
      seen.add(ev.name);
      uniqueEvents.push(ev);
    }
  }

  const results: PrioritySuggestionResult[] = [];

  for (const ev of uniqueEvents) {
    // Skip events that already have an explicit priority
    if (prioritisedNames.has(ev.name)) continue;

    const crossRefs = crossRefCounts.get(ev.name) ?? 1;
    const hasChannel = Boolean(ev.integration?.channel);
    const payloadFields = ev.payload?.length ?? 0;

    let suggestedTier: PrioritySuggestionResult['suggestedTier'] = 'should_have';
    let confidence = 0;
    let reason = '';

    if (ev.confidence === 'CONFIRMED' && payloadFields >= 3) {
      // Rule 1: high-confidence, richly-described event → must-have
      suggestedTier = 'must_have';
      confidence = 85;
      reason = `Confirmed event with ${payloadFields} payload fields — high implementation certainty`;
    } else if (hasChannel) {
      // Rule 2: cross-boundary event → must_have for outbound, should_have for inbound
      if (ev.integration.direction === 'outbound') {
        suggestedTier = 'must_have';
        confidence = 80;
        reason = `Outbound integration via ${ev.integration.channel} — cross-boundary contract`;
      } else {
        suggestedTier = 'should_have';
        confidence = 80;
        reason = `Integration channel ${ev.integration.channel} — external dependency`;
      }
    } else if (crossRefs > 1) {
      // Rule 3: referenced in multiple files → bump tier
      suggestedTier = crossRefs >= 3 ? 'must_have' : 'should_have';
      confidence = 75;
      reason = `Appears in ${crossRefs} submitted files — shared contract`;
    } else if (ev.confidence === 'POSSIBLE') {
      // Rule 4: low-confidence event → could_have
      suggestedTier = 'could_have';
      confidence = 65;
      reason = 'Low confidence — not yet validated by multiple perspectives';
    } else if (ev.confidence === 'LIKELY') {
      // Rule 5: medium-confidence, no channel → should_have
      suggestedTier = 'should_have';
      confidence = 62;
      reason = 'Likely event with no integration channel — standard scope';
    }

    // Only emit suggestions with confidence above the threshold
    if (confidence > 60) {
      results.push({
        eventName: ev.name,
        suggestedTier,
        reason: `Consider making ${ev.name} a ${suggestedTier.replace('_', ' ')} — ${reason}`,
        confidence,
      });
    }
  }

  // Stable sort: highest confidence first, then alpha by event name
  results.sort((a, b) => b.confidence - a.confidence || a.eventName.localeCompare(b.eventName));

  return results;
}
