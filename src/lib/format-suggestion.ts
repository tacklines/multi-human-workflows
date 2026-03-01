import { type WorkflowStatus } from './workflow-engine.js';

export interface SuggestionContext {
  sessionCode: string;
  participantNames?: string[];
}

/**
 * Transform a WorkflowStatus into conversational suggestion text for the
 * suggestion bar UI.
 *
 * The function maps both the engine phase and sub-state within a phase
 * (via artifactInventory) to the most actionable, context-specific suggestion.
 * It uses session-specific details (code, counts) rather than generic phrases.
 *
 * Returns plain text — the component handles any markdown rendering.
 *
 * See: docs/experience-design.md — suggestion bar mapping table
 */
export function formatSuggestion(status: WorkflowStatus, context: SuggestionContext): string {
  const { currentPhase, artifactInventory } = status;
  const { sessionCode, participantNames } = context;
  const {
    participantCount,
    submissionCount,
    unresolvedCount,
    hasContracts,
    hasIntegrationReport,
    integrationStatus,
  } = artifactInventory;

  switch (currentPhase) {
    case 'lobby': {
      if (participantCount === 0) {
        return `Share code ${sessionCode} with your team to get started`;
      }
      // Participants joined but no submissions yet
      return `Everyone's here. Each person submits their domain events independently`;
    }

    case 'prep': {
      if (submissionCount === 0) {
        return `Share code ${sessionCode} with your team to get started`;
      }
      if (submissionCount === 1) {
        return `Waiting for other participants. Meanwhile, check your completeness score in the sidebar`;
      }
      // 2+ submissions still in prep (shouldn't happen per inferPhase, but handle gracefully)
      return `${submissionCount} perspectives submitted. The Conflicts tab shows where they overlap`;
    }

    case 'compare': {
      return `${submissionCount} perspectives submitted. The Conflicts tab shows where they overlap`;
    }

    case 'jam': {
      if (unresolvedCount > 0) {
        return `${unresolvedCount} conflict${unresolvedCount === 1 ? '' : 's'} found. Start with the highest-priority ones`;
      }
      // All conflicts resolved
      return `All conflicts resolved. Ready to formalize into contracts`;
    }

    case 'formalize': {
      if (!hasIntegrationReport) {
        return `Building against contracts. Run an integration check when ready`;
      }
      // Integration report exists but we're still in formalize (shouldn't normally occur)
      return `Building against contracts. Run an integration check when ready`;
    }

    case 'integrate': {
      if (integrationStatus === 'fail') {
        return `Integration checks failed. Review the errors and fix before shipping`;
      }
      if (integrationStatus === 'warn') {
        return `Integration checks passed with warnings. Review before shipping`;
      }
      return `Integration checks running. Review results in the integration panel`;
    }

    case 'done': {
      return `All systems go. Ship it.`;
    }

    default: {
      // Exhaustive check — TypeScript will flag unhandled cases at compile time
      const _exhaustive: never = currentPhase;
      return _exhaustive;
    }
  }
}
