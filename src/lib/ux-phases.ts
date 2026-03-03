import { type WorkflowStatus } from './workflow-engine.js';

/**
 * The seven UX phases displayed in the Phase Ribbon.
 *
 * These are a UX projection over the engine's internal WorkflowPhase values.
 * They are scaffolding for the user's mental model, never gatekeepers.
 *
 * See: docs/experience-design.md — "The Phase Ribbon"
 */
export type UxPhase =
  | 'spark'
  | 'explore'
  | 'rank'
  | 'slice'
  | 'agree'
  | 'build'
  | 'ship';

export interface UxPhaseInfo {
  /** Stable identifier used in logic and URLs */
  id: UxPhase;
  /** Display name shown in the Phase Ribbon */
  label: string;
  /** Keyboard shortcut to jump to this phase's content (Ctrl+Shift+N) */
  shortcut: string;
  /** Engine WorkflowPhase values that overlap with this UX phase */
  enginePhases: string[];
}

/**
 * Ordered array of all seven UX phases with their metadata.
 * Ordered from earliest to latest in the session lifecycle.
 */
export const UX_PHASES: UxPhaseInfo[] = [
  {
    id: 'spark',
    label: 'Spark',
    shortcut: 'Ctrl+Shift+1',
    enginePhases: ['lobby', 'prep'],
  },
  {
    id: 'explore',
    label: 'Explore',
    shortcut: 'Ctrl+Shift+2',
    enginePhases: ['prep'],
  },
  {
    id: 'rank',
    label: 'Rank',
    shortcut: 'Ctrl+Shift+3',
    enginePhases: ['prep'],
  },
  {
    id: 'slice',
    label: 'Slice',
    shortcut: 'Ctrl+Shift+4',
    enginePhases: ['prep', 'compare'],
  },
  {
    id: 'agree',
    label: 'Agree',
    shortcut: 'Ctrl+Shift+5',
    enginePhases: ['compare', 'jam'],
  },
  {
    id: 'build',
    label: 'Build',
    shortcut: 'Ctrl+Shift+6',
    enginePhases: ['formalize'],
  },
  {
    id: 'ship',
    label: 'Ship',
    shortcut: 'Ctrl+Shift+7',
    enginePhases: ['integrate', 'done'],
  },
];

/**
 * Infer the active UX phase from the current WorkflowStatus.
 *
 * Multiple UX phases share the same engine phase (particularly during `prep`).
 * The differentiator is the artifact inventory:
 *
 *   - lobby (no submissions/reqs)     → spark
 *   - prep, requirements OR 1 sub    → explore
 *   - prep, 2+ submissions (no jam)  → rank (ranking available, comparison pending)
 *   - compare (2+ subs, no jam)      → slice (comparison visible, decomp can begin)
 *   - jam started                    → agree
 *   - formalize (contracts loaded)   → build
 *   - integrate / done               → ship
 *
 * The transition points are intentionally loose — the ribbon reflects progress,
 * it does not control navigation.
 */
export function inferUxPhase(status: WorkflowStatus): UxPhase {
  const { currentPhase, artifactInventory } = status;

  switch (currentPhase) {
    case 'lobby':
      return 'spark';

    case 'prep':
      // Spark ends when the first artifact is submitted or a requirement is added.
      // Requirements indicate the user has started articulating their domain,
      // moving past the initial spark even without a YAML submission.
      // Explore: active while a single participant has submitted or requirements exist.
      // Rank: overlaps with Explore — ranking is available once enough events
      //       exist. We transition to rank once multiple submissions are present
      //       but comparison hasn't started yet.
      if (artifactInventory.submissionCount === 0 && artifactInventory.requirementCount === 0) {
        return 'spark';
      }
      if (artifactInventory.submissionCount <= 1) {
        return 'explore';
      }
      // 2+ submissions still in prep state (comparison can begin)
      return 'rank';

    case 'compare':
      // Slice: decomposition can begin before or after comparison.
      // Agree: kicks in once the jam is started (compare → jam transition).
      return 'slice';

    case 'jam':
      return 'agree';

    case 'formalize':
      return 'build';

    case 'integrate':
    case 'done':
      return 'ship';

    default: {
      // Exhaustive check — TypeScript will flag unhandled cases at compile time
      const _exhaustive: never = currentPhase;
      return _exhaustive;
    }
  }
}

/**
 * Return whether all completion conditions for a given UX phase are satisfied.
 *
 * A phase is "complete" when its work is done and the session has moved past it.
 * This is used by the Phase Ribbon to render completed-phase styling.
 *
 * Completion conditions mirror the narrative from experience-design.md:
 *   spark    — first artifact submitted or requirement added (submissionCount >= 1 OR requirementCount > 0)
 *   explore  — more than one submission exists (submissionCount >= 2)
 *   rank     — comparison has started (submissionCount >= 2 AND compare or later)
 *   slice    — jam has been started (hasJam)
 *   agree    — contracts have been generated (hasContracts)
 *   build    — integration report has been loaded (hasIntegrationReport)
 *   ship     — integration passes (integrationStatus === 'pass')
 */
export function isPhaseComplete(phase: UxPhase, status: WorkflowStatus): boolean {
  const inv = status.artifactInventory;

  switch (phase) {
    case 'spark':
      return inv.submissionCount >= 1 || inv.requirementCount > 0;

    case 'explore':
      return inv.submissionCount >= 2;

    case 'rank':
      // Rank completes once comparison is possible and the team has moved to
      // slice/agree or beyond (jam started).
      return inv.hasJam || (inv.submissionCount >= 2 && status.currentPhase !== 'prep' && status.currentPhase !== 'compare');

    case 'slice':
      // Slice is complete once the jam is started (conflicts are being resolved).
      return inv.hasJam;

    case 'agree':
      return inv.hasContracts;

    case 'build':
      return inv.hasIntegrationReport;

    case 'ship':
      return inv.integrationStatus === 'pass';

    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
