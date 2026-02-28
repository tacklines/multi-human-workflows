import { DomainEvent } from "./domain-events.js";

// ---------------------------------------------------------------------------
// Late-join replay helper
// ---------------------------------------------------------------------------

export interface LateJoinOptions {
  /** Only include events strictly after this ISO timestamp. */
  since?: string;
  /** Maximum number of events to return (keeps the most recent N). */
  maxEvents?: number;
}

export interface LateJoinPayload {
  events: DomainEvent[];
  totalCount: number;
  truncated: boolean;
}

/**
 * Build a replay payload for a late-joining participant.
 *
 * Takes the full event array for a session and optionally filters/limits it:
 * - If `since` is provided, only events strictly after that timestamp are
 *   included (lexicographic comparison works for ISO 8601).
 * - If `maxEvents` is provided and more matching events exist, the result is
 *   truncated to the most recent N and `truncated` is set to true.
 *
 * Pure function — no side effects, no DOM dependencies.
 */
export function buildLateJoinPayload(
  events: DomainEvent[],
  options?: LateJoinOptions
): LateJoinPayload {
  const { since, maxEvents } = options ?? {};

  // Step 1: filter by since
  const filtered = since
    ? events.filter((e) => e.timestamp > since)
    : [...events];

  const totalCount = filtered.length;

  // Step 2: truncate to most recent N if needed
  if (maxEvents !== undefined && filtered.length > maxEvents) {
    return {
      events: filtered.slice(filtered.length - maxEvents),
      totalCount,
      truncated: true,
    };
  }

  return {
    events: filtered,
    totalCount,
    truncated: false,
  };
}
