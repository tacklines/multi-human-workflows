import type { LoadedFile, DomainEvent } from '../schema/types.js';

/**
 * Get all unique aggregate names across all loaded files, sorted alphabetically.
 */
export function getAllAggregates(files: LoadedFile[]): string[] {
  const aggregates = new Set<string>();
  for (const file of files) {
    for (const event of file.data.domain_events) {
      aggregates.add(event.aggregate);
    }
  }
  return [...aggregates].sort();
}

/**
 * Group events by their aggregate name.
 */
export function groupByAggregate(events: DomainEvent[]): Map<string, DomainEvent[]> {
  const groups = new Map<string, DomainEvent[]>();
  for (const event of events) {
    const existing = groups.get(event.aggregate) ?? [];
    existing.push(event);
    groups.set(event.aggregate, existing);
  }
  return groups;
}
