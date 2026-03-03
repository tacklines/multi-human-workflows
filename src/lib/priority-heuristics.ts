import type { DomainEvent, EventPriority } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Priority heuristics — suggest MoSCoW tiers for domain events based on
// event characteristics such as confidence, payload richness, integration
// direction, and whether they appear in multiple submitted files.
//
// Pure function: no side effects, no DOM dependencies.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// suggestPrioritiesHeuristic — lightweight heuristic used by the suggest_priorities
// MCP tool. Accepts a flat list of events and a cross-reference count map, and
// returns suggestions with an eventName / suggestedTier / reasoning triple.
//
// This differs from suggestPriorities (below) which accepts existingPriorities
// for filtering and produces a confidence score. Both are pure.
// ---------------------------------------------------------------------------

export interface PrioritySuggestion {
  eventName: string;
  suggestedTier: 'must_have' | 'should_have' | 'could_have';
  reasoning: string;
}

/**
 * Suggest MoSCoW priority tiers for domain events using lightweight heuristics.
 *
 * Rules applied (in order, may stack):
 * 1. confidence === 'CONFIRMED' → must_have
 * 2. confidence === 'LIKELY' → should_have
 * 3. integration.direction === 'outbound' → escalate one tier
 * 4. refCount[event.name] >= 2 → must_have (high-agreement override)
 *
 * Deduplication: first occurrence of each event name wins.
 *
 * @param allEvents  All domain events (may contain duplicates from multiple files).
 * @param refCount   Map of event name → number of submissions containing that event.
 */
export function suggestPrioritiesHeuristic(
  allEvents: DomainEvent[],
  refCount: Record<string, number>
): PrioritySuggestion[] {
  // Deduplicate by name (use first occurrence)
  const seen = new Set<string>();
  const uniqueEvents: DomainEvent[] = [];
  for (const event of allEvents) {
    if (!seen.has(event.name)) {
      seen.add(event.name);
      uniqueEvents.push(event);
    }
  }

  return uniqueEvents.map((event): PrioritySuggestion => {
    const reasons: string[] = [];
    let tier: 'must_have' | 'should_have' | 'could_have' = 'could_have';

    // Signal 1: confidence level
    if (event.confidence === 'CONFIRMED') {
      tier = 'must_have';
      reasons.push('confidence is CONFIRMED');
    } else if (event.confidence === 'LIKELY') {
      tier = 'should_have';
      reasons.push('confidence is LIKELY');
    } else {
      reasons.push('confidence is POSSIBLE');
    }

    // Signal 2: outbound events are integration points — escalate one tier
    if (event.integration?.direction === 'outbound') {
      if (tier === 'could_have') {
        tier = 'should_have';
      } else if (tier === 'should_have') {
        tier = 'must_have';
      }
      reasons.push('outbound integration point (cross-context dependency)');
    }

    // Signal 3: appears in multiple submissions — high agreement signals must_have
    const count = refCount[event.name] ?? 1;
    if (count >= 2) {
      tier = 'must_have';
      reasons.push(`referenced in ${count} participant submissions (high agreement)`);
    }

    return {
      eventName: event.name,
      suggestedTier: tier,
      reasoning: reasons.join('; '),
    };
  });
}

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
