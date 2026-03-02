import type { DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Decomposition heuristics — suggest vertical slice work items from domain
// events grouped by aggregate and trigger pattern.
//
// Pure function: no side effects, no DOM dependencies.
// ---------------------------------------------------------------------------

export interface SuggestedWorkItem {
  title: string;
  description: string;
  linkedEvents: string[];
  complexity: 'S' | 'M' | 'L' | 'XL';
}

export interface AggregateSuggestion {
  aggregate: string;
  suggestedItems: SuggestedWorkItem[];
}

/** Complexity heuristic based on number of linked events in a group */
function complexityFromEventCount(count: number): 'S' | 'M' | 'L' | 'XL' {
  if (count <= 2) return 'S';
  if (count <= 4) return 'M';
  if (count <= 6) return 'L';
  return 'XL';
}

/**
 * Classify a trigger string into a broad pattern label.
 * Groups by the initiating actor/condition hinted at by common prefixes.
 */
function triggerPattern(trigger: string): string {
  const lower = trigger.toLowerCase();
  if (lower.startsWith('user ') || lower.startsWith('customer ') || lower.startsWith('admin ')) {
    return 'user-initiated';
  }
  if (lower.startsWith('system ') || lower.startsWith('service ') || lower.startsWith('platform ')) {
    return 'system-driven';
  }
  if (lower.startsWith('timer') || lower.startsWith('schedule') || lower.startsWith('cron') || lower.startsWith('periodic')) {
    return 'time-based';
  }
  if (lower.startsWith('when ') || lower.startsWith('after ') || lower.startsWith('on ')) {
    return 'reactive';
  }
  if (lower.startsWith('api ') || lower.startsWith('webhook') || lower.startsWith('external')) {
    return 'external-integration';
  }
  // Default: bucket by first word to ensure some grouping
  const firstWord = trigger.split(/\s+/)[0] ?? 'other';
  return firstWord.toLowerCase();
}

/**
 * Derive an imperative title for a work item from a trigger pattern and aggregate name.
 * Example: "user-initiated" + "Order" → "Implement user-initiated Order operations"
 */
function deriveTitle(pattern: string, aggregate: string): string {
  const patternLabel = pattern.replace(/-/g, ' ');
  return `Implement ${patternLabel} ${aggregate} operations`;
}

/**
 * Suggest vertical slice work items for the given domain events.
 *
 * Algorithm:
 * 1. Group events by aggregate (or filter to the given aggregate if provided).
 * 2. Within each aggregate, sub-group by trigger pattern.
 * 3. Each trigger group → one suggested work item.
 * 4. Complexity derived from group size.
 *
 * @param events   All domain events from submitted prep files.
 * @param aggregate  If provided, only generate suggestions for this aggregate.
 */
export function suggestDecomposition(
  events: DomainEvent[],
  aggregate?: string
): AggregateSuggestion[] {
  // Step 1: group events by aggregate
  const byAggregate = new Map<string, DomainEvent[]>();
  for (const event of events) {
    if (aggregate !== undefined && event.aggregate !== aggregate) continue;
    const group = byAggregate.get(event.aggregate) ?? [];
    group.push(event);
    byAggregate.set(event.aggregate, group);
  }

  const suggestions: AggregateSuggestion[] = [];

  for (const [aggName, aggEvents] of byAggregate) {
    // Step 2: sub-group by trigger pattern
    const byPattern = new Map<string, DomainEvent[]>();
    for (const event of aggEvents) {
      const pattern = triggerPattern(event.trigger);
      const group = byPattern.get(pattern) ?? [];
      group.push(event);
      byPattern.set(pattern, group);
    }

    // Step 3: each pattern group → one suggested work item
    const suggestedItems: SuggestedWorkItem[] = [];
    for (const [pattern, patternEvents] of byPattern) {
      const linkedEvents = patternEvents.map((e) => e.name);
      const complexity = complexityFromEventCount(linkedEvents.length);
      suggestedItems.push({
        title: deriveTitle(pattern, aggName),
        description: `Vertical slice covering ${linkedEvents.join(', ')} for the ${aggName} aggregate`,
        linkedEvents,
        complexity,
      });
    }

    suggestions.push({ aggregate: aggName, suggestedItems });
  }

  // Stable sort by aggregate name for deterministic output
  suggestions.sort((a, b) => a.aggregate.localeCompare(b.aggregate));

  return suggestions;
}
