import { describe, it, expect, beforeEach } from 'vitest';
import { ContractService } from './contract-service.js';
import type { SessionData } from './contract-service.js';
import type {
  ContractBundle,
  JamArtifacts,
  LoadedFile,
} from '../../schema/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    code: 'TEST01',
    files: [],
    jam: null,
    contracts: null,
    ...overrides,
  };
}

function makeJam(overrides: Partial<JamArtifacts> = {}): JamArtifacts {
  return {
    startedAt: '2024-01-01T00:00:00.000Z',
    ownershipMap: [],
    resolutions: [],
    unresolved: [],
    ...overrides,
  };
}

function makeLoadedFile(role: string, events: Array<{ name: string; aggregate: string }>): LoadedFile {
  return {
    filename: `${role}.yaml`,
    role,
    data: {
      metadata: {
        role,
        scope: 'test',
        goal: 'test',
        generated_at: '2024-01-01T00:00:00.000Z',
        event_count: events.length,
        assumption_count: 0,
      },
      domain_events: events.map((e) => ({
        name: e.name,
        aggregate: e.aggregate,
        trigger: 'test trigger',
        payload: [{ field: 'id', type: 'string' }],
        integration: { direction: 'internal' as const },
        confidence: 'CONFIRMED' as const,
      })),
      boundary_assumptions: [],
    },
  };
}

function makeContract(overrides: Partial<ContractBundle> = {}): ContractBundle {
  return {
    generatedAt: '2024-01-01T00:00:00.000Z',
    sourceJamCode: 'TEST01',
    eventContracts: [
      {
        eventName: 'OrderPlaced',
        aggregate: 'Order',
        version: '1.0.0',
        schema: { orderId: { type: 'string' } },
        owner: 'orders-team',
        consumers: ['fulfillment-team'],
        producedBy: 'orders-team',
      },
    ],
    boundaryContracts: [
      {
        boundaryName: 'orders-team',
        aggregates: ['Order'],
        events: ['OrderPlaced'],
        owner: 'orders-team',
        externalDependencies: [],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateFromAgreements
// ---------------------------------------------------------------------------

describe('ContractService.generateFromAgreements', () => {
  let service: ContractService;

  beforeEach(() => {
    service = new ContractService(() => null);
  });

  it('returns null when session not found', () => {
    const result = service.generateFromAgreements('NOTFOUND');
    expect(result).toBeNull();
  });

  it('returns null when session has no jam', () => {
    const sessions = new Map<string, SessionData>([
      ['TEST01', makeSession({ code: 'TEST01', jam: null })],
    ]);
    const svc = new ContractService((code) => sessions.get(code) ?? null);
    const result = svc.generateFromAgreements('TEST01');
    expect(result).toBeNull();
  });

  it('generates a contract bundle from jam agreements', () => {
    const file = makeLoadedFile('orders-team', [
      { name: 'OrderPlaced', aggregate: 'Order' },
    ]);
    const session = makeSession({
      code: 'TEST01',
      files: [file],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'orders-team', assignedBy: 'Alice', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const sessions = new Map([['TEST01', session]]);
    const svc = new ContractService((code) => sessions.get(code) ?? null);

    const bundle = svc.generateFromAgreements('TEST01');

    expect(bundle).not.toBeNull();
    expect(bundle!.sourceJamCode).toBe('TEST01');
    expect(bundle!.eventContracts).toHaveLength(1);
    expect(bundle!.eventContracts[0].eventName).toBe('OrderPlaced');
    expect(bundle!.eventContracts[0].owner).toBe('orders-team');
    expect(bundle!.boundaryContracts).toHaveLength(1);
    expect(bundle!.boundaryContracts[0].boundaryName).toBe('orders-team');
  });

  it('marks owner as "unassigned" when no ownership mapping exists', () => {
    const file = makeLoadedFile('unknown-team', [
      { name: 'SomeEvent', aggregate: 'SomeAggregate' },
    ]);
    const session = makeSession({
      code: 'TEST01',
      files: [file],
      jam: makeJam({ ownershipMap: [] }),
    });
    const sessions = new Map([['TEST01', session]]);
    const svc = new ContractService((code) => sessions.get(code) ?? null);

    const bundle = svc.generateFromAgreements('TEST01');

    expect(bundle!.eventContracts[0].owner).toBe('unassigned');
  });

  it('derives event schema from payload fields', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('orders-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'orders-team', assignedBy: 'Alice', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const sessions = new Map([['TEST01', session]]);
    const svc = new ContractService((code) => sessions.get(code) ?? null);

    const bundle = svc.generateFromAgreements('TEST01');

    // makeLoadedFile adds a payload field 'id' of type 'string'
    expect(bundle!.eventContracts[0].schema).toHaveProperty('id');
    expect((bundle!.eventContracts[0].schema as Record<string, unknown>)['id']).toEqual({ type: 'string' });
  });

  it('emits ContractGenerated domain event when eventStore is provided', () => {
    const emitted: unknown[] = [];
    const fakeEventStore = {
      append: (_code: string, event: unknown) => { emitted.push(event); },
    };

    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('team', [{ name: 'E', aggregate: 'A' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'A', ownerRole: 'team', assignedBy: 'x', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const sessions = new Map([['TEST01', session]]);
    const svc = new ContractService(
      (code) => sessions.get(code) ?? null,
      fakeEventStore as never
    );

    svc.generateFromAgreements('TEST01');

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { type: string }).type).toBe('ContractGenerated');
  });
});

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

describe('ContractService.diff', () => {
  let service: ContractService;

  beforeEach(() => {
    service = new ContractService(() => null);
  });

  it('returns empty diff for identical bundles', () => {
    const bundle = makeContract();
    const result = service.diff(bundle, bundle);

    expect(result.changes).toHaveLength(0);
    expect(result.addedEvents).toHaveLength(0);
    expect(result.removedEvents).toHaveLength(0);
    expect(result.modifiedEvents).toHaveLength(0);
  });

  it('detects added event contracts', () => {
    const bundleA = makeContract({ eventContracts: [] });
    const bundleB = makeContract();

    const result = service.diff(bundleA, bundleB);

    expect(result.addedEvents).toContain('OrderPlaced');
    expect(result.changes.find((c) => c.type === 'added' && c.name === 'OrderPlaced')).toBeDefined();
  });

  it('detects removed event contracts', () => {
    const bundleA = makeContract();
    const bundleB = makeContract({ eventContracts: [] });

    const result = service.diff(bundleA, bundleB);

    expect(result.removedEvents).toContain('OrderPlaced');
    expect(result.changes.find((c) => c.type === 'removed' && c.name === 'OrderPlaced')).toBeDefined();
  });

  it('detects modified event contracts when owner changes', () => {
    const bundleA = makeContract();
    const bundleB = makeContract({
      eventContracts: [
        {
          eventName: 'OrderPlaced',
          aggregate: 'Order',
          version: '1.0.0',
          schema: { orderId: { type: 'string' } },
          owner: 'new-team',
          consumers: ['fulfillment-team'],
          producedBy: 'new-team',
        },
      ],
    });

    const result = service.diff(bundleA, bundleB);

    expect(result.modifiedEvents).toContain('OrderPlaced');
    const change = result.changes.find((c) => c.type === 'modified' && c.name === 'OrderPlaced');
    expect(change?.description).toContain('owner changed');
  });

  it('detects modified event contracts when version changes', () => {
    const bundleA = makeContract();
    const bundleB = makeContract({
      eventContracts: [
        {
          ...makeContract().eventContracts[0],
          version: '2.0.0',
        },
      ],
    });

    const result = service.diff(bundleA, bundleB);

    expect(result.modifiedEvents).toContain('OrderPlaced');
    const change = result.changes.find((c) => c.type === 'modified');
    expect(change?.description).toContain('version changed');
  });

  it('detects added boundary contracts', () => {
    const bundleA = makeContract({ boundaryContracts: [] });
    const bundleB = makeContract();

    const result = service.diff(bundleA, bundleB);

    expect(result.addedBoundaries).toContain('orders-team');
  });

  it('detects removed boundary contracts', () => {
    const bundleA = makeContract();
    const bundleB = makeContract({ boundaryContracts: [] });

    const result = service.diff(bundleA, bundleB);

    expect(result.removedBoundaries).toContain('orders-team');
  });
});

// ---------------------------------------------------------------------------
// checkCompliance
// ---------------------------------------------------------------------------

describe('ContractService.checkCompliance', () => {
  let service: ContractService;

  beforeEach(() => {
    service = new ContractService(() => null);
  });

  it('passes when all contract events are present in session', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('orders-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'orders-team', assignedBy: 'Alice', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const contract = makeContract();

    const report = service.checkCompliance(session, contract);

    expect(report.overallStatus).toBe('pass');
    const eventCheck = report.checks.find((c) => c.name === 'event-present:OrderPlaced');
    expect(eventCheck?.status).toBe('pass');
  });

  it('fails when a contracted event is missing from session', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [],
      jam: makeJam(),
    });
    const contract = makeContract();

    const report = service.checkCompliance(session, contract);

    expect(report.overallStatus).toBe('fail');
    const eventCheck = report.checks.find((c) => c.name === 'event-present:OrderPlaced');
    expect(eventCheck?.status).toBe('fail');
  });

  it('warns when ownership in session does not match contract', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('other-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'other-team', assignedBy: 'Bob', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const contract = makeContract(); // expects orders-team

    const report = service.checkCompliance(session, contract);

    const ownerCheck = report.checks.find((c) => c.name === 'ownership-match:Order');
    expect(ownerCheck?.status).toBe('warn');
  });

  it('warns when no jam session exists', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('orders-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: null,
    });
    const contract = makeContract();

    const report = service.checkCompliance(session, contract);

    const jamCheck = report.checks.find((c) => c.name === 'jam-started');
    expect(jamCheck?.status).toBe('warn');
  });

  it('warns about unresolved items', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('orders-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'orders-team', assignedBy: 'Alice', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
        unresolved: [
          { id: 'u1', description: 'Unclear ownership', flaggedBy: 'Alice', flaggedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const contract = makeContract();

    const report = service.checkCompliance(session, contract);

    const unresolvedCheck = report.checks.find((c) => c.name === 'unresolved-items');
    expect(unresolvedCheck?.status).toBe('warn');
  });

  it('emits ComplianceCheckCompleted domain event when eventStore is provided', () => {
    const emitted: unknown[] = [];
    const fakeEventStore = {
      append: (_code: string, event: unknown) => { emitted.push(event); },
    };

    const session = makeSession({
      code: 'TEST01',
      files: [],
      jam: makeJam(),
    });
    const svc = new ContractService(() => null, fakeEventStore as never);
    svc.checkCompliance(session, makeContract());

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { type: string }).type).toBe('ComplianceCheckCompleted');
  });

  it('summary reflects failure count', () => {
    const session = makeSession({ code: 'TEST01', files: [], jam: makeJam() });
    const contract = makeContract();

    const report = service.checkCompliance(session, contract);

    expect(report.summary).toMatch(/failed/i);
  });
});

// ---------------------------------------------------------------------------
// detectDrift
// ---------------------------------------------------------------------------

describe('ContractService.detectDrift', () => {
  it('returns null when session not found', () => {
    const service = new ContractService(() => null);
    const result = service.detectDrift('NOTFOUND');
    expect(result).toBeNull();
  });

  it('returns no-drift report when no contracts are loaded', () => {
    const session = makeSession({ code: 'TEST01', contracts: null });
    const sessions = new Map([['TEST01', session]]);
    const service = new ContractService((code) => sessions.get(code) ?? null);

    const report = service.detectDrift('TEST01');

    expect(report).not.toBeNull();
    expect(report!.hasDrift).toBe(false);
    expect(report!.driftItems).toHaveLength(0);
  });

  it('detects drift when contracted event is removed from submissions', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [], // no submissions — event is gone
      contracts: makeContract(), // contract expects OrderPlaced
    });
    const sessions = new Map([['TEST01', session]]);
    const service = new ContractService((code) => sessions.get(code) ?? null);

    const report = service.detectDrift('TEST01');

    expect(report!.hasDrift).toBe(true);
    const item = report!.driftItems.find((d) => d.eventName === 'OrderPlaced');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('critical');
  });

  it('detects drift when new event appears in submissions not in contracts', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [
        makeLoadedFile('orders-team', [
          { name: 'OrderPlaced', aggregate: 'Order' },
          { name: 'OrderShipped', aggregate: 'Order' }, // new event not in contract
        ]),
      ],
      contracts: makeContract(), // only knows about OrderPlaced
    });
    const sessions = new Map([['TEST01', session]]);
    const service = new ContractService((code) => sessions.get(code) ?? null);

    const report = service.detectDrift('TEST01');

    expect(report!.hasDrift).toBe(true);
    const item = report!.driftItems.find((d) => d.eventName === 'OrderShipped');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('warning');
  });

  it('detects ownership drift when jam assignment contradicts contract', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('orders-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'new-team', assignedBy: 'Bob', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
      contracts: makeContract(), // contract expects orders-team for Order
    });
    const sessions = new Map([['TEST01', session]]);
    const service = new ContractService((code) => sessions.get(code) ?? null);

    const report = service.detectDrift('TEST01');

    expect(report!.hasDrift).toBe(true);
    const item = report!.driftItems.find((d) => d.issue.includes('Ownership drift'));
    expect(item).toBeDefined();
    expect(item!.severity).toBe('critical');
  });

  it('returns no drift when session matches contracts exactly', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [makeLoadedFile('orders-team', [{ name: 'OrderPlaced', aggregate: 'Order' }])],
      jam: makeJam({
        ownershipMap: [
          { aggregate: 'Order', ownerRole: 'orders-team', assignedBy: 'Alice', assignedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
      contracts: makeContract(),
    });
    const sessions = new Map([['TEST01', session]]);
    const service = new ContractService((code) => sessions.get(code) ?? null);

    const report = service.detectDrift('TEST01');

    expect(report!.hasDrift).toBe(false);
    expect(report!.driftItems).toHaveLength(0);
  });

  it('emits DriftDetected domain event for each drift item when eventStore is provided', () => {
    const emitted: unknown[] = [];
    const fakeEventStore = {
      append: (_code: string, event: unknown) => { emitted.push(event); },
    };

    const session = makeSession({
      code: 'TEST01',
      files: [], // missing OrderPlaced -> critical drift
      contracts: makeContract(),
    });
    const sessions = new Map([['TEST01', session]]);
    const svc = new ContractService(
      (code) => sessions.get(code) ?? null,
      fakeEventStore as never
    );

    const report = svc.detectDrift('TEST01');

    expect(report!.hasDrift).toBe(true);
    expect(emitted.length).toBeGreaterThan(0);
    expect((emitted[0] as { type: string }).type).toBe('DriftDetected');
  });

  it('summary reflects drift when items are present', () => {
    const session = makeSession({
      code: 'TEST01',
      files: [],
      contracts: makeContract(),
    });
    const sessions = new Map([['TEST01', session]]);
    const service = new ContractService((code) => sessions.get(code) ?? null);

    const report = service.detectDrift('TEST01');

    expect(report!.summary).toMatch(/drift detected/i);
  });
});
