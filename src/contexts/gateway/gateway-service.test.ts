import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayService } from './gateway-service.js';
import { SessionStore } from '../../lib/session-store.js';
import { AgreementService } from '../agreement/agreement-service.js';
import { EventStore } from '../session/event-store.js';
import type { CandidateEventsFile } from '../../schema/types.js';

// Minimal valid CandidateEventsFile for test submissions
const minimalFile: CandidateEventsFile = {
  metadata: {
    role: 'tester',
    scope: 'test-scope',
    goal: 'test-goal',
    generated_at: '2026-01-01T00:00:00Z',
    event_count: 1,
    assumption_count: 0,
  },
  domain_events: [
    {
      name: 'TestEvent',
      aggregate: 'TestAggregate',
      trigger: 'user action',
      payload: [{ field: 'id', type: 'string' }],
      integration: { direction: 'outbound' },
      confidence: 'CONFIRMED',
    },
  ],
  boundary_assumptions: [],
};

function buildGateway(): { gateway: GatewayService; store: SessionStore; eventStore: EventStore } {
  const store = new SessionStore();
  const eventStore = new EventStore();
  const agreementService = new AgreementService(
    (code) => store.getSession(code),
    eventStore
  );
  const gateway = new GatewayService(store, agreementService, eventStore);
  return { gateway, store, eventStore };
}

describe('GatewayService — session commands', () => {
  it('createSession returns serialized session with code and creatorId', () => {
    const { gateway } = buildGateway();
    const result = gateway.createSession('Alice');
    expect(result.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(result.creatorId).toBeTruthy();
    expect(result.session.code).toBe(result.code);
    expect(result.session.participants).toHaveLength(1);
    expect(result.session.participants[0].name).toBe('Alice');
  });

  it('joinSession returns serialized session with participantId', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const result = gateway.joinSession(code, 'Bob');
    expect(result).not.toBeNull();
    expect(result!.participantId).toBeTruthy();
    expect(result!.session.participants).toHaveLength(2);
  });

  it('joinSession returns null for unknown session code', () => {
    const { gateway } = buildGateway();
    const result = gateway.joinSession('XXXXXX', 'Bob');
    expect(result).toBeNull();
  });
});

describe('GatewayService — artifact commands', () => {
  it('submitArtifact returns submittedAt on success', () => {
    const { gateway } = buildGateway();
    const { code, creatorId } = gateway.createSession('Alice');
    const result = gateway.submitArtifact(code, creatorId, 'alice.yaml', minimalFile);
    expect(result).not.toBeNull();
    expect(result!.submittedAt).toBeTruthy();
  });

  it('submitArtifact returns null for unknown session', () => {
    const { gateway } = buildGateway();
    const result = gateway.submitArtifact('XXXXXX', 'fake-id', 'test.yaml', minimalFile);
    expect(result).toBeNull();
  });

  it('submitArtifact returns null for participant not in session', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const result = gateway.submitArtifact(code, 'wrong-participant-id', 'test.yaml', minimalFile);
    expect(result).toBeNull();
  });
});

describe('GatewayService — query operations', () => {
  it('getSession returns serialized session view', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const view = gateway.getSession(code);
    expect(view).not.toBeNull();
    expect(view!.code).toBe(code);
    expect(Array.isArray(view!.participants)).toBe(true);
  });

  it('getSession returns null for unknown code', () => {
    const { gateway } = buildGateway();
    expect(gateway.getSession('XXXXXX')).toBeNull();
  });

  it('getSessionFiles returns submitted files as LoadedFile[]', () => {
    const { gateway } = buildGateway();
    const { code, creatorId } = gateway.createSession('Alice');
    gateway.submitArtifact(code, creatorId, 'alice.yaml', minimalFile);
    const files = gateway.getSessionFiles(code);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('alice.yaml');
    expect(files[0].role).toBe('Alice');
  });

  it('getSessionFiles returns empty array for unknown session', () => {
    const { gateway } = buildGateway();
    expect(gateway.getSessionFiles('XXXXXX')).toHaveLength(0);
  });
});

describe('GatewayService — agreement commands', () => {
  it('startJam initializes jam artifacts', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const jam = gateway.startJam(code);
    expect(jam).not.toBeNull();
    expect(jam!.resolutions).toHaveLength(0);
    expect(jam!.ownershipMap).toHaveLength(0);
    expect(jam!.unresolved).toHaveLength(0);
  });

  it('startJam returns null for unknown session', () => {
    const { gateway } = buildGateway();
    expect(gateway.startJam('XXXXXX')).toBeNull();
  });

  it('resolveConflict records a resolution', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.startJam(code);
    const resolution = gateway.resolveConflict(code, {
      overlapLabel: 'SameNameOverlap',
      resolution: 'Merge into shared event',
      chosenApproach: 'merge',
      resolvedBy: ['Alice'],
    });
    expect(resolution).not.toBeNull();
    expect(resolution!.resolvedAt).toBeTruthy();
    expect(resolution!.overlapLabel).toBe('SameNameOverlap');
  });

  it('resolveConflict returns null when jam not started', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const result = gateway.resolveConflict(code, {
      overlapLabel: 'label',
      resolution: 'desc',
      chosenApproach: 'merge',
      resolvedBy: ['Alice'],
    });
    expect(result).toBeNull();
  });

  it('assignOwnership records an assignment', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.startJam(code);
    const assignment = gateway.assignOwnership(code, {
      aggregate: 'Order',
      ownerRole: 'backend',
      assignedBy: 'Alice',
    });
    expect(assignment).not.toBeNull();
    expect(assignment!.aggregate).toBe('Order');
    expect(assignment!.assignedAt).toBeTruthy();
  });

  it('assignOwnership replaces existing assignment for same aggregate', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.startJam(code);
    gateway.assignOwnership(code, { aggregate: 'Order', ownerRole: 'backend', assignedBy: 'Alice' });
    gateway.assignOwnership(code, { aggregate: 'Order', ownerRole: 'frontend', assignedBy: 'Alice' });
    const jam = gateway.exportJam(code);
    const orderOwners = jam!.ownershipMap.filter((o) => o.aggregate === 'Order');
    expect(orderOwners).toHaveLength(1);
    expect(orderOwners[0].ownerRole).toBe('frontend');
  });

  it('flagUnresolved records an unresolved item', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.startJam(code);
    const item = gateway.flagUnresolved(code, {
      description: 'Unclear ownership of Payment aggregate',
      flaggedBy: 'Alice',
    });
    expect(item).not.toBeNull();
    expect(item!.id).toBeTruthy();
    expect(item!.flaggedAt).toBeTruthy();
  });

  it('exportJam returns full jam artifacts', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.startJam(code);
    gateway.resolveConflict(code, {
      overlapLabel: 'overlap-1',
      resolution: 'merged',
      chosenApproach: 'merge',
      resolvedBy: ['Alice'],
    });
    const jam = gateway.exportJam(code);
    expect(jam).not.toBeNull();
    expect(jam!.resolutions).toHaveLength(1);
  });

  it('exportJam returns null when jam not started', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    expect(gateway.exportJam(code)).toBeNull();
  });
});

describe('GatewayService — contract commands', () => {
  const bundle = {
    generatedAt: '2026-01-01T00:00:00Z',
    eventContracts: [
      {
        eventName: 'OrderPlaced',
        aggregate: 'Order',
        version: '1.0.0',
        schema: {},
        owner: 'backend',
        consumers: ['frontend'],
        producedBy: 'order-service',
      },
    ],
    boundaryContracts: [],
  };

  it('loadContracts stores and returns the bundle', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const result = gateway.loadContracts(code, bundle);
    expect(result).not.toBeNull();
    expect(result!.eventContracts).toHaveLength(1);
  });

  it('loadContracts returns null for unknown session', () => {
    const { gateway } = buildGateway();
    expect(gateway.loadContracts('XXXXXX', bundle)).toBeNull();
  });

  it('getContracts returns loaded bundle', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.loadContracts(code, bundle);
    const result = gateway.getContracts(code);
    expect(result).not.toBeNull();
    expect(result!.eventContracts[0].eventName).toBe('OrderPlaced');
  });

  it('getContracts returns null when no bundle loaded', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    expect(gateway.getContracts(code)).toBeNull();
  });
});

describe('GatewayService — integration commands', () => {
  const report = {
    generatedAt: '2026-01-01T00:00:00Z',
    sourceContracts: [],
    checks: [
      { name: 'schema-check', status: 'pass' as const, message: 'All schemas valid' },
    ],
    overallStatus: 'pass' as const,
    summary: 'All checks passed',
  };

  it('loadIntegrationReport stores and returns the report', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const result = gateway.loadIntegrationReport(code, report);
    expect(result).not.toBeNull();
    expect(result!.overallStatus).toBe('pass');
  });

  it('loadIntegrationReport returns null for unknown session', () => {
    const { gateway } = buildGateway();
    expect(gateway.loadIntegrationReport('XXXXXX', report)).toBeNull();
  });

  it('getIntegrationReport returns loaded report', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    gateway.loadIntegrationReport(code, report);
    const result = gateway.getIntegrationReport(code);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('All checks passed');
  });

  it('getIntegrationReport returns null when no report loaded', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    expect(gateway.getIntegrationReport(code)).toBeNull();
  });
});

describe('GatewayService — workflow queries', () => {
  it('getWorkflowPhase returns null for unknown session', () => {
    const { gateway } = buildGateway();
    expect(gateway.getWorkflowPhase('XXXXXX')).toBeNull();
  });

  it('getWorkflowPhase returns lobby phase for new session', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    const status = gateway.getWorkflowPhase(code);
    expect(status).not.toBeNull();
    expect(status!.currentPhase).toBe('lobby');
  });

  it('getWorkflowPhase returns prep phase after one submission', () => {
    const { gateway } = buildGateway();
    const { code, creatorId } = gateway.createSession('Alice');
    gateway.submitArtifact(code, creatorId, 'alice.yaml', minimalFile);
    const status = gateway.getWorkflowPhase(code);
    expect(status!.currentPhase).toBe('prep');
  });

  it('getWorkflowPhase returns compare phase after two submissions', () => {
    const { gateway } = buildGateway();
    const { code, creatorId } = gateway.createSession('Alice');
    const join = gateway.joinSession(code, 'Bob');
    gateway.submitArtifact(code, creatorId, 'alice.yaml', minimalFile);
    gateway.submitArtifact(code, join!.participantId, 'bob.yaml', minimalFile);
    const status = gateway.getWorkflowPhase(code);
    expect(status!.currentPhase).toBe('compare');
  });

  it('getPrepStatus returns null for unknown session', () => {
    const { gateway } = buildGateway();
    expect(gateway.getPrepStatus('XXXXXX')).toBeNull();
  });

  it('getPrepStatus returns session prep analysis', () => {
    const { gateway } = buildGateway();
    const { code, creatorId } = gateway.createSession('Alice');
    gateway.submitArtifact(code, creatorId, 'alice.yaml', minimalFile);
    const status = gateway.getPrepStatus(code);
    expect(status).not.toBeNull();
    expect(status!.fileCount).toBe(1);
    expect(status!.totalEvents).toBe(1);
  });

  it('getComparisonResult returns empty array for session with no files', () => {
    const { gateway } = buildGateway();
    const { code } = gateway.createSession('Alice');
    expect(gateway.getComparisonResult(code)).toHaveLength(0);
  });

  it('getComparisonResult returns overlaps for files with shared events', () => {
    const { gateway } = buildGateway();
    const { code, creatorId } = gateway.createSession('Alice');
    const join = gateway.joinSession(code, 'Bob');
    const aliceFile: CandidateEventsFile = {
      ...minimalFile,
      metadata: { ...minimalFile.metadata, role: 'Alice' },
    };
    const bobFile: CandidateEventsFile = {
      ...minimalFile,
      metadata: { ...minimalFile.metadata, role: 'Bob' },
    };
    gateway.submitArtifact(code, creatorId, 'alice.yaml', aliceFile);
    gateway.submitArtifact(code, join!.participantId, 'bob.yaml', bobFile);
    const overlaps = gateway.getComparisonResult(code);
    // Both files have 'TestEvent' and 'TestAggregate' — expect overlaps
    expect(overlaps.length).toBeGreaterThan(0);
  });
});
