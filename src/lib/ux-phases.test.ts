import { describe, it, expect } from 'vitest';
import {
  inferUxPhase,
  isPhaseComplete,
  UX_PHASES,
  type UxPhase,
} from './ux-phases.js';
import { type WorkflowStatus, type ArtifactInventory } from './workflow-engine.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeInventory(overrides: Partial<ArtifactInventory> = {}): ArtifactInventory {
  return {
    participantCount: 1,
    submissionCount: 0,
    hasJam: false,
    resolutionCount: 0,
    ownershipCount: 0,
    unresolvedCount: 0,
    hasContracts: false,
    contractCount: 0,
    hasIntegrationReport: false,
    integrationStatus: null,
    ...overrides,
  };
}

function makeStatus(
  currentPhase: WorkflowStatus['currentPhase'],
  inventoryOverrides: Partial<ArtifactInventory> = {}
): WorkflowStatus {
  return {
    currentPhase,
    phases: [],
    artifactInventory: makeInventory(inventoryOverrides),
    nextAction: '',
  };
}

// ─── UX_PHASES array ──────────────────────────────────────────────────────

describe('UX_PHASES', () => {
  it('contains exactly 7 phases', () => {
    expect(UX_PHASES).toHaveLength(7);
  });

  it('phases are ordered spark → explore → rank → slice → agree → build → ship', () => {
    const ids = UX_PHASES.map((p) => p.id);
    expect(ids).toEqual(['spark', 'explore', 'rank', 'slice', 'agree', 'build', 'ship']);
  });

  it('each phase has a non-empty label', () => {
    for (const phase of UX_PHASES) {
      expect(phase.label.length).toBeGreaterThan(0);
    }
  });

  it('keyboard shortcuts are Ctrl+Shift+1 through Ctrl+Shift+7 in order', () => {
    const shortcuts = UX_PHASES.map((p) => p.shortcut);
    expect(shortcuts).toEqual([
      'Ctrl+Shift+1',
      'Ctrl+Shift+2',
      'Ctrl+Shift+3',
      'Ctrl+Shift+4',
      'Ctrl+Shift+5',
      'Ctrl+Shift+6',
      'Ctrl+Shift+7',
    ]);
  });

  it('each phase declares at least one engine phase', () => {
    for (const phase of UX_PHASES) {
      expect(phase.enginePhases.length).toBeGreaterThan(0);
    }
  });

  it('spark maps to lobby and prep engine phases', () => {
    const spark = UX_PHASES.find((p) => p.id === 'spark')!;
    expect(spark.enginePhases).toContain('lobby');
    expect(spark.enginePhases).toContain('prep');
  });

  it('agree maps to compare and jam engine phases', () => {
    const agree = UX_PHASES.find((p) => p.id === 'agree')!;
    expect(agree.enginePhases).toContain('compare');
    expect(agree.enginePhases).toContain('jam');
  });

  it('ship maps to integrate and done engine phases', () => {
    const ship = UX_PHASES.find((p) => p.id === 'ship')!;
    expect(ship.enginePhases).toContain('integrate');
    expect(ship.enginePhases).toContain('done');
  });
});

// ─── inferUxPhase ─────────────────────────────────────────────────────────

describe('inferUxPhase', () => {
  describe('Given engine phase is lobby', () => {
    it('returns spark when no submissions', () => {
      expect(inferUxPhase(makeStatus('lobby', { submissionCount: 0 }))).toBe('spark');
    });
  });

  describe('Given engine phase is prep', () => {
    it('returns spark when submissionCount is 0', () => {
      expect(inferUxPhase(makeStatus('prep', { submissionCount: 0 }))).toBe('spark');
    });

    it('returns explore when exactly 1 submission exists', () => {
      expect(inferUxPhase(makeStatus('prep', { submissionCount: 1 }))).toBe('explore');
    });

    it('returns rank when 2 or more submissions exist', () => {
      expect(inferUxPhase(makeStatus('prep', { submissionCount: 2 }))).toBe('rank');
      expect(inferUxPhase(makeStatus('prep', { submissionCount: 5 }))).toBe('rank');
    });
  });

  describe('Given engine phase is compare', () => {
    it('returns slice', () => {
      expect(
        inferUxPhase(makeStatus('compare', { submissionCount: 2 }))
      ).toBe('slice');
    });
  });

  describe('Given engine phase is jam', () => {
    it('returns agree', () => {
      expect(
        inferUxPhase(makeStatus('jam', { submissionCount: 2, hasJam: true }))
      ).toBe('agree');
    });
  });

  describe('Given engine phase is formalize', () => {
    it('returns build', () => {
      expect(
        inferUxPhase(makeStatus('formalize', { hasContracts: true }))
      ).toBe('build');
    });
  });

  describe('Given engine phase is integrate', () => {
    it('returns ship', () => {
      expect(
        inferUxPhase(makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'fail' }))
      ).toBe('ship');

      expect(
        inferUxPhase(makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'warn' }))
      ).toBe('ship');
    });
  });

  describe('Given engine phase is done', () => {
    it('returns ship', () => {
      expect(
        inferUxPhase(makeStatus('done', { hasIntegrationReport: true, integrationStatus: 'pass' }))
      ).toBe('ship');
    });
  });

  describe('phase progression walkthrough', () => {
    it('walks through all seven UX phases in a typical session', () => {
      // Phase 1: No submissions yet → spark
      expect(inferUxPhase(makeStatus('lobby'))).toBe('spark');

      // Phase 2: First submission → explore
      expect(inferUxPhase(makeStatus('prep', { submissionCount: 1 }))).toBe('explore');

      // Phase 3: Second submission available but still in prep → rank
      expect(inferUxPhase(makeStatus('prep', { submissionCount: 2 }))).toBe('rank');

      // Phase 4: Compare started → slice
      expect(inferUxPhase(makeStatus('compare', { submissionCount: 2 }))).toBe('slice');

      // Phase 5: Jam started → agree
      expect(inferUxPhase(makeStatus('jam', { hasJam: true }))).toBe('agree');

      // Phase 6: Contracts generated → build
      expect(inferUxPhase(makeStatus('formalize', { hasContracts: true }))).toBe('build');

      // Phase 7: Integration report → ship
      expect(inferUxPhase(makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'fail' }))).toBe('ship');
      expect(inferUxPhase(makeStatus('done', { hasIntegrationReport: true, integrationStatus: 'pass' }))).toBe('ship');
    });
  });
});

// ─── isPhaseComplete ──────────────────────────────────────────────────────

describe('isPhaseComplete', () => {
  describe('spark', () => {
    it('is incomplete when no submissions exist', () => {
      expect(isPhaseComplete('spark', makeStatus('lobby', { submissionCount: 0 }))).toBe(false);
    });

    it('is complete when at least one submission exists', () => {
      expect(isPhaseComplete('spark', makeStatus('prep', { submissionCount: 1 }))).toBe(true);
      expect(isPhaseComplete('spark', makeStatus('prep', { submissionCount: 5 }))).toBe(true);
    });
  });

  describe('explore', () => {
    it('is incomplete with only one submission', () => {
      expect(isPhaseComplete('explore', makeStatus('prep', { submissionCount: 1 }))).toBe(false);
    });

    it('is complete when 2 or more submissions exist', () => {
      expect(isPhaseComplete('explore', makeStatus('prep', { submissionCount: 2 }))).toBe(true);
      expect(isPhaseComplete('explore', makeStatus('compare', { submissionCount: 3 }))).toBe(true);
    });
  });

  describe('rank', () => {
    it('is incomplete during prep phase', () => {
      expect(isPhaseComplete('rank', makeStatus('prep', { submissionCount: 2 }))).toBe(false);
    });

    it('is incomplete during compare phase', () => {
      expect(isPhaseComplete('rank', makeStatus('compare', { submissionCount: 2 }))).toBe(false);
    });

    it('is complete when jam has been started', () => {
      expect(isPhaseComplete('rank', makeStatus('jam', { hasJam: true }))).toBe(true);
    });

    it('is complete once past prep and compare (e.g., formalize)', () => {
      expect(isPhaseComplete('rank', makeStatus('formalize', { submissionCount: 2, hasContracts: true }))).toBe(true);
    });
  });

  describe('slice', () => {
    it('is incomplete before jam is started', () => {
      expect(isPhaseComplete('slice', makeStatus('compare', { submissionCount: 2 }))).toBe(false);
    });

    it('is complete when jam has been started', () => {
      expect(isPhaseComplete('slice', makeStatus('jam', { hasJam: true }))).toBe(true);
      expect(isPhaseComplete('slice', makeStatus('formalize', { hasJam: true, hasContracts: true }))).toBe(true);
    });
  });

  describe('agree', () => {
    it('is incomplete before contracts are generated', () => {
      expect(isPhaseComplete('agree', makeStatus('jam', { hasJam: true }))).toBe(false);
    });

    it('is complete when contracts have been generated', () => {
      expect(isPhaseComplete('agree', makeStatus('formalize', { hasContracts: true }))).toBe(true);
    });
  });

  describe('build', () => {
    it('is incomplete before integration report is loaded', () => {
      expect(isPhaseComplete('build', makeStatus('formalize', { hasContracts: true }))).toBe(false);
    });

    it('is complete when integration report exists', () => {
      expect(
        isPhaseComplete('build', makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'fail' }))
      ).toBe(true);
      expect(
        isPhaseComplete('build', makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'pass' }))
      ).toBe(true);
    });
  });

  describe('ship', () => {
    it('is incomplete when integration has not passed', () => {
      expect(
        isPhaseComplete('ship', makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'fail' }))
      ).toBe(false);

      expect(
        isPhaseComplete('ship', makeStatus('integrate', { hasIntegrationReport: true, integrationStatus: 'warn' }))
      ).toBe(false);

      expect(
        isPhaseComplete('ship', makeStatus('integrate', { hasIntegrationReport: false, integrationStatus: null }))
      ).toBe(false);
    });

    it('is complete when integration status is pass', () => {
      expect(
        isPhaseComplete('ship', makeStatus('done', { hasIntegrationReport: true, integrationStatus: 'pass' }))
      ).toBe(true);
    });
  });

  describe('all phases on a complete session', () => {
    it('all phases are complete when integration passes', () => {
      const fullyCompleteStatus = makeStatus('done', {
        participantCount: 2,
        submissionCount: 3,
        hasJam: true,
        resolutionCount: 2,
        ownershipCount: 2,
        hasContracts: true,
        contractCount: 5,
        hasIntegrationReport: true,
        integrationStatus: 'pass',
      });

      const phases: UxPhase[] = ['spark', 'explore', 'rank', 'slice', 'agree', 'build', 'ship'];
      for (const phase of phases) {
        expect(isPhaseComplete(phase, fullyCompleteStatus), `expected ${phase} to be complete`).toBe(true);
      }
    });
  });

  describe('early session: no phases complete', () => {
    it('no phases are complete in a fresh lobby session', () => {
      const emptyStatus = makeStatus('lobby', { submissionCount: 0 });
      const phases: UxPhase[] = ['spark', 'explore', 'rank', 'slice', 'agree', 'build', 'ship'];
      for (const phase of phases) {
        expect(isPhaseComplete(phase, emptyStatus), `expected ${phase} to be incomplete`).toBe(false);
      }
    });
  });
});
