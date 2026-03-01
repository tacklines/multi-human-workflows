import { describe, it, expect } from 'vitest';
import { formatSuggestion, type SuggestionContext } from './format-suggestion.js';
import { type WorkflowStatus, type ArtifactInventory } from './workflow-engine.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeInventory(overrides: Partial<ArtifactInventory> = {}): ArtifactInventory {
  return {
    participantCount: 0,
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

const defaultContext: SuggestionContext = {
  sessionCode: 'ABC123',
};

// ─── Lobby phase ──────────────────────────────────────────────────────────────

describe('formatSuggestion — lobby phase', () => {
  it('includes session code when no participants have joined', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toContain('ABC123');
    expect(result).toContain('Share');
  });

  it('tells team to share the code when zero participants', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/share code ABC123/i);
  });

  it('acknowledges participants when they have joined but no submissions exist', () => {
    const status = makeStatus('lobby', { participantCount: 3, submissionCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/everyone.?s here/i);
    expect(result).toContain('domain events');
  });

  it('does not include session code when participants have joined', () => {
    const status = makeStatus('lobby', { participantCount: 2, submissionCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).not.toContain('ABC123');
  });

  it('works with an empty session code when no participants have joined', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const ctx: SuggestionContext = { sessionCode: '' };
    const result = formatSuggestion(status, ctx);
    // Should still produce a string (may have empty code inline)
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('works with a single participant who has joined', () => {
    const status = makeStatus('lobby', { participantCount: 1, submissionCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/everyone.?s here/i);
  });
});

// ─── Prep phase ───────────────────────────────────────────────────────────────

describe('formatSuggestion — prep phase', () => {
  it('tells others to wait and check completeness when one submission exists', () => {
    const status = makeStatus('prep', { submissionCount: 1 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/waiting for other participants/i);
    expect(result).toMatch(/completeness/i);
  });

  it('does not include session code for single-submission state', () => {
    const status = makeStatus('prep', { submissionCount: 1 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).not.toContain('ABC123');
  });
});

// ─── Compare phase ────────────────────────────────────────────────────────────

describe('formatSuggestion — compare phase', () => {
  it('shows submission count and mentions Conflicts tab', () => {
    const status = makeStatus('compare', { submissionCount: 3 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toContain('3');
    expect(result).toMatch(/conflicts/i);
  });

  it('works with exactly two submissions', () => {
    const status = makeStatus('compare', { submissionCount: 2 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toContain('2');
    expect(result).toMatch(/perspectives/i);
  });
});

// ─── Jam phase ────────────────────────────────────────────────────────────────

describe('formatSuggestion — jam phase', () => {
  it('includes unresolved count when conflicts remain', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 5 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toContain('5');
    expect(result).toMatch(/conflict/i);
    expect(result).toMatch(/highest-priority/i);
  });

  it('uses singular "conflict" when unresolvedCount is 1', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 1 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/1 conflict found/i);
    // Must not say "conflicts" (plural)
    expect(result).not.toMatch(/1 conflicts/i);
  });

  it('uses plural "conflicts" when unresolvedCount is > 1', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 4 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/4 conflicts found/i);
  });

  it('signals ready-to-formalize when all conflicts are resolved', () => {
    const status = makeStatus('jam', { hasJam: true, unresolvedCount: 0 });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/all conflicts resolved/i);
    expect(result).toMatch(/formalize/i);
  });
});

// ─── Formalize phase ──────────────────────────────────────────────────────────

describe('formatSuggestion — formalize phase', () => {
  it('prompts to run an integration check when contracts are loaded', () => {
    const status = makeStatus('formalize', { hasContracts: true });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/integration check/i);
  });

  it('mentions building against contracts', () => {
    const status = makeStatus('formalize', { hasContracts: true });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/contracts/i);
  });
});

// ─── Integrate phase ──────────────────────────────────────────────────────────

describe('formatSuggestion — integrate phase', () => {
  it('reports failure message when integration status is fail', () => {
    const status = makeStatus('integrate', {
      hasIntegrationReport: true,
      integrationStatus: 'fail',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/failed/i);
  });

  it('reports warnings when integration status is warn', () => {
    const status = makeStatus('integrate', {
      hasIntegrationReport: true,
      integrationStatus: 'warn',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/warn/i);
  });
});

// ─── Done phase ───────────────────────────────────────────────────────────────

describe('formatSuggestion — done phase', () => {
  it('returns the "all systems go" message when integration passes', () => {
    const status = makeStatus('done', {
      hasIntegrationReport: true,
      integrationStatus: 'pass',
    });
    const result = formatSuggestion(status, defaultContext);
    expect(result).toMatch(/all systems go/i);
    expect(result).toMatch(/ship/i);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('formatSuggestion — edge cases', () => {
  it('handles zero participants in lobby gracefully', () => {
    const status = makeStatus('lobby', { participantCount: 0 });
    const ctx: SuggestionContext = { sessionCode: 'XYZ' };
    const result = formatSuggestion(status, ctx);
    expect(result).toContain('XYZ');
  });

  it('accepts optional participantNames without error', () => {
    const status = makeStatus('lobby', { participantCount: 2 });
    const ctx: SuggestionContext = {
      sessionCode: 'ABC123',
      participantNames: ['Alice', 'Bob'],
    };
    const result = formatSuggestion(status, ctx);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for every phase', () => {
    const phases: WorkflowStatus['currentPhase'][] = [
      'lobby',
      'prep',
      'compare',
      'jam',
      'formalize',
      'integrate',
      'done',
    ];
    for (const phase of phases) {
      const status = makeStatus(phase, {
        participantCount: 2,
        submissionCount: 2,
        hasJam: true,
        unresolvedCount: 0,
        hasContracts: true,
        hasIntegrationReport: true,
        integrationStatus: phase === 'done' ? 'pass' : 'fail',
      });
      const result = formatSuggestion(status, defaultContext);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
