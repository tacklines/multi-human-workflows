import type {
  ContractBundle,
  EventContract,
  BoundaryContract,
  IntegrationReport,
  IntegrationCheck,
  JamArtifacts,
  LoadedFile,
} from '../../schema/types.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type {
  ContractGenerated,
  ComplianceCheckCompleted,
  DriftDetected,
} from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// ContractDiff — structural diff between two contract bundles
// ---------------------------------------------------------------------------

export interface ContractChange {
  type: 'added' | 'removed' | 'modified';
  kind: 'eventContract' | 'boundaryContract';
  name: string;
  description: string;
}

export interface ContractDiff {
  changes: ContractChange[];
  addedEvents: string[];
  removedEvents: string[];
  modifiedEvents: string[];
  addedBoundaries: string[];
  removedBoundaries: string[];
  modifiedBoundaries: string[];
}

// ---------------------------------------------------------------------------
// DriftReport — comparison of current session state vs loaded contracts
// ---------------------------------------------------------------------------

export interface DriftItem {
  eventName: string;
  issue: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface DriftReport {
  sessionCode: string;
  generatedAt: string;
  hasDrift: boolean;
  driftItems: DriftItem[];
  summary: string;
}

// ---------------------------------------------------------------------------
// SessionData — narrow type for what ContractService needs from session state
// ---------------------------------------------------------------------------

export interface SessionData {
  code: string;
  files: LoadedFile[];
  jam: JamArtifacts | null;
  contracts: ContractBundle | null;
}

// ---------------------------------------------------------------------------
// ContractService — contract generation, diffing, compliance, and drift detection
// ---------------------------------------------------------------------------

export class ContractService {
  private readonly getSession: (code: string) => SessionData | null;
  private readonly eventStore: EventStore | null;

  constructor(
    getSession: (code: string) => SessionData | null,
    eventStore?: EventStore
  ) {
    this.getSession = getSession;
    this.eventStore = eventStore ?? null;
  }

  /**
   * Generate a ContractBundle from a session's jam agreements.
   * Derives event contracts from ownership assignments and resolution choices.
   * Returns null if the session is not found or has no jam artifacts.
   */
  generateFromAgreements(code: string): ContractBundle | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;

    const { jam, files } = session;

    // Build a set of events from submitted files for schema extraction
    const eventsByName = new Map<string, import('../../schema/types.js').DomainEvent>();
    for (const file of files) {
      for (const evt of file.data.domain_events) {
        if (!eventsByName.has(evt.name)) {
          eventsByName.set(evt.name, evt);
        }
      }
    }

    // Build ownership lookup: aggregate -> ownerRole
    const ownerByAggregate = new Map<string, string>();
    for (const assignment of jam.ownershipMap) {
      ownerByAggregate.set(assignment.aggregate, assignment.ownerRole);
    }

    // Build resolution lookup: overlapLabel -> chosenApproach
    const resolutionByLabel = new Map<string, string>();
    for (const resolution of jam.resolutions) {
      resolutionByLabel.set(resolution.overlapLabel, resolution.chosenApproach);
    }

    // Generate event contracts from owned aggregates + known events
    const eventContracts: EventContract[] = [];
    for (const [eventName, event] of eventsByName) {
      const owner = ownerByAggregate.get(event.aggregate) ?? 'unassigned';
      // Derive consumers from resolution approaches referencing this aggregate
      const consumers = jam.resolutions
        .filter((r) => r.chosenApproach !== owner && r.resolvedBy.length > 0)
        .flatMap((r) => r.resolvedBy)
        .filter((name, idx, arr) => arr.indexOf(name) === idx && name !== owner);

      // Build a simple schema from event payload fields
      const schema: Record<string, unknown> = {};
      for (const field of event.payload) {
        schema[field.field] = { type: field.type };
      }

      eventContracts.push({
        eventName,
        aggregate: event.aggregate,
        version: '1.0.0',
        schema,
        owner,
        consumers,
        producedBy: owner,
      });
    }

    // Generate boundary contracts from ownership map
    // Group events by aggregate owner
    const eventsByOwner = new Map<string, string[]>();
    for (const contract of eventContracts) {
      const owner = contract.owner;
      if (!eventsByOwner.has(owner)) {
        eventsByOwner.set(owner, []);
      }
      eventsByOwner.get(owner)!.push(contract.eventName);
    }

    // Group aggregates by owner
    const aggregatesByOwner = new Map<string, string[]>();
    for (const [aggregate, owner] of ownerByAggregate) {
      if (!aggregatesByOwner.has(owner)) {
        aggregatesByOwner.set(owner, []);
      }
      aggregatesByOwner.get(owner)!.push(aggregate);
    }

    const boundaryContracts: BoundaryContract[] = [];
    for (const [owner, aggregates] of aggregatesByOwner) {
      const events = eventsByOwner.get(owner) ?? [];
      // External dependencies: other roles that produce events consumed by this owner
      const externalDependencies = eventContracts
        .filter((ec) => ec.consumers.includes(owner) && ec.owner !== owner)
        .map((ec) => ec.owner)
        .filter((dep, idx, arr) => arr.indexOf(dep) === idx);

      boundaryContracts.push({
        boundaryName: owner,
        aggregates,
        events,
        owner,
        externalDependencies,
      });
    }

    const bundle: ContractBundle = {
      generatedAt: new Date().toISOString(),
      sourceJamCode: session.code,
      eventContracts,
      boundaryContracts,
    };

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ContractGenerated',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: bundle.generatedAt,
        contractId: generateId(),
        version: 1,
      } satisfies ContractGenerated);
    }

    return bundle;
  }

  /**
   * Diff two contract bundles. Returns a ContractDiff describing what changed.
   */
  diff(contractA: ContractBundle, contractB: ContractBundle): ContractDiff {
    const changes: ContractChange[] = [];

    // Index bundle A
    const aEventMap = new Map<string, EventContract>(
      contractA.eventContracts.map((ec) => [ec.eventName, ec])
    );
    const bEventMap = new Map<string, EventContract>(
      contractB.eventContracts.map((ec) => [ec.eventName, ec])
    );
    const aBoundaryMap = new Map<string, BoundaryContract>(
      contractA.boundaryContracts.map((bc) => [bc.boundaryName, bc])
    );
    const bBoundaryMap = new Map<string, BoundaryContract>(
      contractB.boundaryContracts.map((bc) => [bc.boundaryName, bc])
    );

    // Event contract changes
    const addedEvents: string[] = [];
    const removedEvents: string[] = [];
    const modifiedEvents: string[] = [];

    for (const [name, bEvent] of bEventMap) {
      if (!aEventMap.has(name)) {
        addedEvents.push(name);
        changes.push({
          type: 'added',
          kind: 'eventContract',
          name,
          description: `Event contract "${name}" added (owner: ${bEvent.owner})`,
        });
      } else {
        const aEvent = aEventMap.get(name)!;
        if (
          aEvent.owner !== bEvent.owner ||
          aEvent.version !== bEvent.version ||
          JSON.stringify(aEvent.schema) !== JSON.stringify(bEvent.schema) ||
          JSON.stringify(aEvent.consumers.sort()) !== JSON.stringify(bEvent.consumers.sort())
        ) {
          modifiedEvents.push(name);
          const desc: string[] = [];
          if (aEvent.owner !== bEvent.owner) desc.push(`owner changed: ${aEvent.owner} -> ${bEvent.owner}`);
          if (aEvent.version !== bEvent.version) desc.push(`version changed: ${aEvent.version} -> ${bEvent.version}`);
          if (JSON.stringify(aEvent.schema) !== JSON.stringify(bEvent.schema)) desc.push('schema changed');
          if (JSON.stringify(aEvent.consumers.sort()) !== JSON.stringify(bEvent.consumers.sort())) {
            desc.push('consumers changed');
          }
          changes.push({
            type: 'modified',
            kind: 'eventContract',
            name,
            description: `Event contract "${name}" modified: ${desc.join('; ')}`,
          });
        }
      }
    }

    for (const [name] of aEventMap) {
      if (!bEventMap.has(name)) {
        removedEvents.push(name);
        changes.push({
          type: 'removed',
          kind: 'eventContract',
          name,
          description: `Event contract "${name}" removed`,
        });
      }
    }

    // Boundary contract changes
    const addedBoundaries: string[] = [];
    const removedBoundaries: string[] = [];
    const modifiedBoundaries: string[] = [];

    for (const [name, bBoundary] of bBoundaryMap) {
      if (!aBoundaryMap.has(name)) {
        addedBoundaries.push(name);
        changes.push({
          type: 'added',
          kind: 'boundaryContract',
          name,
          description: `Boundary contract "${name}" added`,
        });
      } else {
        const aBoundary = aBoundaryMap.get(name)!;
        if (
          JSON.stringify(aBoundary.aggregates.sort()) !== JSON.stringify(bBoundary.aggregates.sort()) ||
          JSON.stringify(aBoundary.events.sort()) !== JSON.stringify(bBoundary.events.sort()) ||
          JSON.stringify(aBoundary.externalDependencies.sort()) !== JSON.stringify(bBoundary.externalDependencies.sort())
        ) {
          modifiedBoundaries.push(name);
          const desc: string[] = [];
          if (JSON.stringify(aBoundary.aggregates.sort()) !== JSON.stringify(bBoundary.aggregates.sort())) {
            desc.push('aggregates changed');
          }
          if (JSON.stringify(aBoundary.events.sort()) !== JSON.stringify(bBoundary.events.sort())) {
            desc.push('events changed');
          }
          if (
            JSON.stringify(aBoundary.externalDependencies.sort()) !==
            JSON.stringify(bBoundary.externalDependencies.sort())
          ) {
            desc.push('external dependencies changed');
          }
          changes.push({
            type: 'modified',
            kind: 'boundaryContract',
            name,
            description: `Boundary contract "${name}" modified: ${desc.join('; ')}`,
          });
        }
      }
    }

    for (const [name] of aBoundaryMap) {
      if (!bBoundaryMap.has(name)) {
        removedBoundaries.push(name);
        changes.push({
          type: 'removed',
          kind: 'boundaryContract',
          name,
          description: `Boundary contract "${name}" removed`,
        });
      }
    }

    return {
      changes,
      addedEvents,
      removedEvents,
      modifiedEvents,
      addedBoundaries,
      removedBoundaries,
      modifiedBoundaries,
    };
  }

  /**
   * Check whether the current session state complies with a given contract.
   * Returns an IntegrationReport with pass/fail/warn checks.
   */
  checkCompliance(sessionData: SessionData, contract: ContractBundle): IntegrationReport {
    const checks: IntegrationCheck[] = [];

    // Build a set of event names from submitted files
    const sessionEventNames = new Set<string>(
      sessionData.files.flatMap((f) => f.data.domain_events.map((e) => e.name))
    );

    // Check: all contracted events are present in submissions
    for (const ec of contract.eventContracts) {
      if (sessionEventNames.has(ec.eventName)) {
        checks.push({
          name: `event-present:${ec.eventName}`,
          status: 'pass',
          message: `Event "${ec.eventName}" is present in session submissions`,
        });
      } else {
        checks.push({
          name: `event-present:${ec.eventName}`,
          status: 'fail',
          message: `Event "${ec.eventName}" is in contract but missing from session submissions`,
          details: `Expected owner: ${ec.owner}`,
        });
      }
    }

    // Check: all contracted aggregates have an ownership assignment
    if (sessionData.jam) {
      const assignedAggregates = new Set(
        sessionData.jam.ownershipMap.map((o) => o.aggregate)
      );

      for (const ec of contract.eventContracts) {
        if (ec.owner === 'unassigned') continue;
        if (assignedAggregates.has(ec.aggregate)) {
          const assignment = sessionData.jam.ownershipMap.find(
            (o) => o.aggregate === ec.aggregate
          );
          if (assignment && assignment.ownerRole !== ec.owner) {
            checks.push({
              name: `ownership-match:${ec.aggregate}`,
              status: 'warn',
              message: `Aggregate "${ec.aggregate}" is assigned to "${assignment.ownerRole}" but contract expects "${ec.owner}"`,
            });
          } else {
            checks.push({
              name: `ownership-match:${ec.aggregate}`,
              status: 'pass',
              message: `Aggregate "${ec.aggregate}" ownership matches contract`,
            });
          }
        } else {
          checks.push({
            name: `ownership-match:${ec.aggregate}`,
            status: 'warn',
            message: `Aggregate "${ec.aggregate}" has no ownership assignment in session`,
            details: `Contract expects owner: ${ec.owner}`,
          });
        }
      }
    } else {
      // No jam started — ownership not validated
      checks.push({
        name: 'jam-started',
        status: 'warn',
        message: 'Jam session not started — ownership compliance cannot be verified',
      });
    }

    // Check: no unresolved items blocking contract finalization
    if (sessionData.jam && sessionData.jam.unresolved.length > 0) {
      checks.push({
        name: 'unresolved-items',
        status: 'warn',
        message: `${sessionData.jam.unresolved.length} unresolved item(s) may affect contract accuracy`,
        details: sessionData.jam.unresolved.map((u) => u.description).join('; '),
      });
    }

    const failCount = checks.filter((c) => c.status === 'fail').length;
    const warnCount = checks.filter((c) => c.status === 'warn').length;
    const overallStatus: import('../../schema/types.js').IntegrationCheckStatus =
      failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';

    const summary =
      failCount > 0
        ? `Compliance check failed: ${failCount} failure(s), ${warnCount} warning(s)`
        : warnCount > 0
        ? `Compliance check passed with ${warnCount} warning(s)`
        : `Compliance check passed (${checks.length} check(s))`;

    const report: IntegrationReport = {
      generatedAt: new Date().toISOString(),
      sourceContracts: contract.sourceJamCode ? [contract.sourceJamCode] : [],
      checks,
      overallStatus,
      summary,
    };

    if (this.eventStore) {
      this.eventStore.append(sessionData.code, {
        type: 'ComplianceCheckCompleted',
        eventId: generateId(),
        sessionCode: sessionData.code,
        timestamp: report.generatedAt,
        contractId: generateId(),
        passed: overallStatus === 'pass',
        failures: checks.filter((c) => c.status === 'fail').map((c) => c.message),
      } satisfies ComplianceCheckCompleted);
    }

    return report;
  }

  /**
   * Detect drift between the current session state and the loaded contracts.
   * Returns a DriftReport, or null if the session is not found.
   */
  detectDrift(code: string): DriftReport | null {
    const session = this.getSession(code);
    if (!session) return null;

    const generatedAt = new Date().toISOString();
    const driftItems: DriftItem[] = [];

    if (!session.contracts) {
      return {
        sessionCode: session.code,
        generatedAt,
        hasDrift: false,
        driftItems: [],
        summary: 'No contracts loaded — drift detection not applicable',
      };
    }

    const contracts = session.contracts;

    // Build current event set
    const currentEventNames = new Set<string>(
      session.files.flatMap((f) => f.data.domain_events.map((e) => e.name))
    );

    // Check for events in contracts that are no longer in session submissions
    for (const ec of contracts.eventContracts) {
      if (!currentEventNames.has(ec.eventName)) {
        driftItems.push({
          eventName: ec.eventName,
          issue: `Event "${ec.eventName}" is in the loaded contract but no longer present in session submissions`,
          severity: 'critical',
        });
      }
    }

    // Check for new events in submissions that are not in contracts
    const contractEventNames = new Set(contracts.eventContracts.map((ec) => ec.eventName));
    for (const eventName of currentEventNames) {
      if (!contractEventNames.has(eventName)) {
        driftItems.push({
          eventName,
          issue: `Event "${eventName}" is in session submissions but not in the loaded contract`,
          severity: 'warning',
        });
      }
    }

    // Check ownership drift — jam assignments vs contract ownership
    if (session.jam) {
      for (const assignment of session.jam.ownershipMap) {
        // Find event contracts for this aggregate
        const relevantContracts = contracts.eventContracts.filter(
          (ec) => ec.aggregate === assignment.aggregate
        );
        for (const ec of relevantContracts) {
          if (ec.owner !== assignment.ownerRole && ec.owner !== 'unassigned') {
            driftItems.push({
              eventName: ec.eventName,
              issue: `Ownership drift: aggregate "${assignment.aggregate}" is now assigned to "${assignment.ownerRole}" but contract says "${ec.owner}"`,
              severity: 'critical',
            });
          }
        }
      }
    }

    const hasDrift = driftItems.length > 0;
    const criticalCount = driftItems.filter((d) => d.severity === 'critical').length;
    const warnCount = driftItems.filter((d) => d.severity === 'warning').length;

    const summary = hasDrift
      ? `Drift detected: ${criticalCount} critical issue(s), ${warnCount} warning(s)`
      : 'No drift detected — session state matches loaded contracts';

    if (hasDrift && this.eventStore) {
      for (const item of driftItems) {
        this.eventStore.append(session.code, {
          type: 'DriftDetected',
          eventId: generateId(),
          sessionCode: session.code,
          timestamp: generatedAt,
          contractId: contracts.sourceJamCode ?? 'unknown',
          driftDescription: item.issue,
        } satisfies DriftDetected);
      }
    }

    return {
      sessionCode: session.code,
      generatedAt,
      hasDrift,
      driftItems,
      summary,
    };
  }
}
