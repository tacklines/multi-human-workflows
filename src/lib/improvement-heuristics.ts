import type { CandidateEventsFile, DomainEvent } from '../schema/types.js';
import { computePrepStatus } from './prep-completeness.js';

// ---------------------------------------------------------------------------
// Improvement heuristics — analyze a submitted artifact and generate specific
// suggestions for improving coverage, assumptions, confidence, and integration.
//
// Pure function: no side effects, no DOM dependencies.
// ---------------------------------------------------------------------------

export interface ImprovementSuggestion {
  type: 'missing_event' | 'missing_assumption' | 'confidence_upgrade' | 'pattern_match';
  description: string;
  suggestedContent?: Partial<DomainEvent>;
}

/**
 * Analyze a submitted artifact and generate specific improvement suggestions.
 *
 * Heuristic rules:
 * 1. Command-like events (Created/Updated/Submitted/Initiated/Approved/Placed)
 *    without a corresponding failure event → suggest adding one.
 * 2. No boundary assumptions declared → suggest adding at least one.
 * 3. POSSIBLE confidence events → suggest upgrading to LIKELY when evidence exists.
 * 4. No outbound events → suggest considering cross-context emissions.
 *
 * @param file A validated CandidateEventsFile to analyze.
 * @returns A list of improvement suggestions (may be empty).
 */
export function suggestImprovementsForFile(file: CandidateEventsFile): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];
  const status = computePrepStatus(file);

  // Missing failure events: if command-like events exist but no failure counterpart
  const eventNames = file.domain_events.map((e) => e.name);
  const commandEvents = eventNames.filter((n) =>
    /Created|Updated|Submitted|Initiated|Approved|Placed/i.test(n)
  );
  for (const cmd of commandEvents) {
    const base = cmd.replace(/Created|Updated|Submitted|Initiated|Approved|Placed/i, '');
    const hasFailed = eventNames.some(
      (n) =>
        n.toLowerCase().includes(base.toLowerCase() + 'fail') ||
        n.toLowerCase().includes('failed')
    );
    if (!hasFailed) {
      suggestions.push({
        type: 'missing_event',
        description: `Consider adding a failure event for "${cmd}" — e.g., "${base}Failed"`,
        suggestedContent: {
          name: `${base}Failed`,
          aggregate: file.domain_events.find((e) => e.name === cmd)?.aggregate ?? base,
          trigger: `${cmd} processing fails`,
          payload: [{ field: 'reason', type: 'string' }],
          integration: { direction: 'internal' },
          confidence: 'POSSIBLE',
        },
      });
    }
  }

  // Missing assumptions
  if (status.assumptionCount === 0) {
    suggestions.push({
      type: 'missing_assumption',
      description:
        'No boundary assumptions declared — add at least one to clarify service ownership or external dependencies',
    });
  }

  // Confidence upgrades: POSSIBLE events that could be LIKELY
  const possibleEvents = file.domain_events.filter((e) => e.confidence === 'POSSIBLE');
  for (const event of possibleEvents) {
    suggestions.push({
      type: 'confidence_upgrade',
      description: `"${event.name}" is POSSIBLE — if there is stakeholder evidence, upgrade to LIKELY`,
      suggestedContent: { name: event.name, confidence: 'LIKELY' },
    });
  }

  // Pattern match: if no outbound events, suggest integration
  if (status.directionBreakdown['outbound'] === 0 && status.eventCount > 0) {
    suggestions.push({
      type: 'pattern_match',
      description:
        'No outbound events found — consider which events are emitted to other bounded contexts',
    });
  }

  return suggestions;
}
