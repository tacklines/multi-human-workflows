import {
  DomainEvent,
  ArtifactSubmitted,
  ArtifactValidationFailed,
  ComparisonCompleted,
  ConflictsDetected,
  ItemFlagged,
  OwnershipAssigned,
  ParticipantJoined,
  ParticipantLeft,
  ResolutionRecorded,
  SessionClosed,
  SessionCreated,
  SessionPaused,
} from "./domain-events.js";
import { EventStore } from "./event-store.js";

// ---------------------------------------------------------------------------
// Generic Projection interface
// ---------------------------------------------------------------------------

export interface Projection<T> {
  apply(event: DomainEvent): void;
  getState(): T;
  reset(): void;
}

// ---------------------------------------------------------------------------
// SessionDashboardProjection
// ---------------------------------------------------------------------------

export interface SessionDashboardState {
  sessionCode: string;
  creatorName: string;
  creatorId: string;
  status: "active" | "paused" | "closed";
  participants: Array<{
    id: string;
    name: string;
    type: "human" | "agent" | "service";
    joinedAt: string;
    leftAt?: string;
  }>;
  createdAt: string;
  closedAt?: string;
}

const emptyDashboardState = (): SessionDashboardState => ({
  sessionCode: "",
  creatorName: "",
  creatorId: "",
  status: "active" as const,
  participants: [],
  createdAt: "",
});

export class SessionDashboardProjection
  implements Projection<SessionDashboardState>
{
  private state: SessionDashboardState = emptyDashboardState();

  apply(event: DomainEvent): void {
    switch (event.type) {
      case "SessionCreated": {
        const e = event as SessionCreated;
        this.state = {
          ...emptyDashboardState(),
          sessionCode: e.sessionCode,
          creatorName: e.creatorName,
          creatorId: e.creatorId,
          status: "active",
          createdAt: e.timestamp,
        };
        break;
      }
      case "ParticipantJoined": {
        const e = event as ParticipantJoined;
        this.state = {
          ...this.state,
          participants: [
            ...this.state.participants,
            {
              id: e.participantId,
              name: e.participantName,
              type: e.participantType,
              joinedAt: e.timestamp,
            },
          ],
        };
        break;
      }
      case "ParticipantLeft": {
        const e = event as ParticipantLeft;
        this.state = {
          ...this.state,
          participants: this.state.participants.map((p) =>
            p.id === e.participantId ? { ...p, leftAt: e.timestamp } : p
          ),
        };
        break;
      }
      case "SessionPaused": {
        this.state = { ...this.state, status: "paused" };
        break;
      }
      case "SessionResumed": {
        this.state = { ...this.state, status: "active" };
        break;
      }
      case "SessionClosed": {
        const e = event as SessionClosed;
        this.state = {
          ...this.state,
          status: "closed",
          closedAt: e.timestamp,
        };
        break;
      }
      default:
        // ignore events not in this projection's scope
        break;
    }
  }

  getState(): SessionDashboardState {
    return { ...this.state, participants: [...this.state.participants] };
  }

  reset(): void {
    this.state = emptyDashboardState();
  }
}

// ---------------------------------------------------------------------------
// ArtifactTimelineProjection
// ---------------------------------------------------------------------------

export interface ArtifactTimelineEntry {
  artifactId: string;
  participantId: string;
  fileName: string;
  type: string;
  version: number;
  timestamp: string;
  validationErrors?: string[];
}

export interface ArtifactTimelineState {
  sessionCode: string;
  entries: ArtifactTimelineEntry[];
}

const emptyTimelineState = (): ArtifactTimelineState => ({
  sessionCode: "",
  entries: [],
});

export class ArtifactTimelineProjection
  implements Projection<ArtifactTimelineState>
{
  private state: ArtifactTimelineState = emptyTimelineState();

  apply(event: DomainEvent): void {
    switch (event.type) {
      case "ArtifactSubmitted": {
        const e = event as ArtifactSubmitted;
        const entry: ArtifactTimelineEntry = {
          artifactId: e.artifactId,
          participantId: e.participantId,
          fileName: e.fileName,
          type: e.artifactType,
          version: e.version,
          timestamp: e.timestamp,
        };
        this.state = {
          sessionCode: e.sessionCode,
          entries: [...this.state.entries, entry].sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
          ),
        };
        break;
      }
      case "ArtifactValidationFailed": {
        const e = event as ArtifactValidationFailed;
        const entry: ArtifactTimelineEntry = {
          artifactId: e.artifactId,
          participantId: e.participantId,
          fileName: e.fileName,
          type: "validation-failure",
          version: 0,
          timestamp: e.timestamp,
          validationErrors: e.errors,
        };
        this.state = {
          sessionCode: e.sessionCode,
          entries: [...this.state.entries, entry].sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
          ),
        };
        break;
      }
      default:
        break;
    }
  }

  getState(): ArtifactTimelineState {
    return { ...this.state, entries: [...this.state.entries] };
  }

  reset(): void {
    this.state = emptyTimelineState();
  }
}

// ---------------------------------------------------------------------------
// ConflictTrackerProjection
// ---------------------------------------------------------------------------

export interface ConflictEntry {
  label: string;
  description: string;
  status: "open" | "resolved";
  resolution?: string;
}

export interface ComparisonEntry {
  comparisonId: string;
  overlapCount: number;
  gapCount: number;
}

export interface ConflictTrackerState {
  sessionCode: string;
  comparisons: ComparisonEntry[];
  conflicts: ConflictEntry[];
}

const emptyConflictState = (): ConflictTrackerState => ({
  sessionCode: "",
  comparisons: [],
  conflicts: [],
});

export class ConflictTrackerProjection
  implements Projection<ConflictTrackerState>
{
  private state: ConflictTrackerState = emptyConflictState();

  apply(event: DomainEvent): void {
    switch (event.type) {
      case "ComparisonCompleted": {
        const e = event as ComparisonCompleted;
        this.state = {
          ...this.state,
          sessionCode: e.sessionCode,
          comparisons: [
            ...this.state.comparisons,
            {
              comparisonId: e.comparisonId,
              overlapCount: e.overlapCount,
              gapCount: e.gapCount,
            },
          ],
        };
        break;
      }
      case "ConflictsDetected": {
        const e = event as ConflictsDetected;
        const newConflicts: ConflictEntry[] = e.conflicts.map((c) => ({
          label: c.label,
          description: c.description,
          status: "open" as const,
        }));
        this.state = {
          ...this.state,
          sessionCode: e.sessionCode,
          conflicts: [...this.state.conflicts, ...newConflicts],
        };
        break;
      }
      case "ResolutionRecorded": {
        const e = event as ResolutionRecorded;
        this.state = {
          ...this.state,
          conflicts: this.state.conflicts.map((c) =>
            c.label === e.overlapLabel
              ? { ...c, status: "resolved" as const, resolution: e.resolution }
              : c
          ),
        };
        break;
      }
      default:
        break;
    }
  }

  getState(): ConflictTrackerState {
    return {
      ...this.state,
      comparisons: [...this.state.comparisons],
      conflicts: [...this.state.conflicts],
    };
  }

  reset(): void {
    this.state = emptyConflictState();
  }
}

// ---------------------------------------------------------------------------
// AgreementProgressProjection
// ---------------------------------------------------------------------------

export interface ResolutionEntry {
  overlapLabel: string;
  resolution: string;
  chosenApproach: string;
  resolvedBy: string[];
}

export interface FlagEntry {
  description: string;
  flaggedBy: string;
  relatedOverlap?: string;
}

export interface AgreementProgressState {
  sessionCode: string;
  resolutions: ResolutionEntry[];
  ownership: Map<string, string>;
  flags: FlagEntry[];
}

const emptyAgreementState = (): AgreementProgressState => ({
  sessionCode: "",
  resolutions: [],
  ownership: new Map(),
  flags: [],
});

export class AgreementProgressProjection
  implements Projection<AgreementProgressState>
{
  private state: AgreementProgressState = emptyAgreementState();

  apply(event: DomainEvent): void {
    switch (event.type) {
      case "ResolutionRecorded": {
        const e = event as ResolutionRecorded;
        this.state = {
          ...this.state,
          sessionCode: e.sessionCode,
          resolutions: [
            ...this.state.resolutions,
            {
              overlapLabel: e.overlapLabel,
              resolution: e.resolution,
              chosenApproach: e.chosenApproach,
              resolvedBy: [...e.resolvedBy],
            },
          ],
        };
        break;
      }
      case "OwnershipAssigned": {
        const e = event as OwnershipAssigned;
        const newOwnership = new Map(this.state.ownership);
        newOwnership.set(e.aggregate, e.ownerRole);
        this.state = {
          ...this.state,
          sessionCode: e.sessionCode,
          ownership: newOwnership,
        };
        break;
      }
      case "ItemFlagged": {
        const e = event as ItemFlagged;
        const flag: FlagEntry = {
          description: e.description,
          flaggedBy: e.flaggedBy,
        };
        if (e.relatedOverlap !== undefined) {
          flag.relatedOverlap = e.relatedOverlap;
        }
        this.state = {
          ...this.state,
          sessionCode: e.sessionCode,
          flags: [...this.state.flags, flag],
        };
        break;
      }
      default:
        break;
    }
  }

  getState(): AgreementProgressState {
    return {
      ...this.state,
      resolutions: [...this.state.resolutions],
      ownership: new Map(this.state.ownership),
      flags: [...this.state.flags],
    };
  }

  reset(): void {
    this.state = emptyAgreementState();
  }
}

// ---------------------------------------------------------------------------
// ProtocolStateProjection
// ---------------------------------------------------------------------------

export interface ProtocolState {
  sessionCode: string;
  phase: string;
  participantCount: number;
  artifactCount: number;
  conflictCount: number;
  resolvedCount: number;
  flagCount: number;
  lastEventAt: string;
}

const emptyProtocolState = (): ProtocolState => ({
  sessionCode: "",
  phase: "setup",
  participantCount: 0,
  artifactCount: 0,
  conflictCount: 0,
  resolvedCount: 0,
  flagCount: 0,
  lastEventAt: "",
});

/** Derive the current workflow phase from the event type. */
function derivePhase(
  current: string,
  eventType: DomainEvent["type"]
): string {
  switch (eventType) {
    case "SessionCreated":
      return "setup";
    case "ParticipantJoined":
    case "ParticipantLeft":
      return current === "setup" ? "setup" : current;
    case "ArtifactSubmitted":
    case "ArtifactValidationFailed":
      return "prep";
    case "ComparisonCompleted":
    case "ConflictsDetected":
    case "GapsIdentified":
      return "comparison";
    case "ResolutionRecorded":
    case "OwnershipAssigned":
    case "ItemFlagged":
      return "agreement";
    case "ContractGenerated":
    case "ComplianceCheckCompleted":
    case "DriftDetected":
      return "contract";
    case "SessionPaused":
    case "SessionResumed":
    case "SessionClosed":
      return current;
    default:
      return current;
  }
}

export class ProtocolStateProjection
  implements Projection<ProtocolState>
{
  private state: ProtocolState = emptyProtocolState();

  apply(event: DomainEvent): void {
    const next: ProtocolState = {
      ...this.state,
      sessionCode: event.sessionCode,
      lastEventAt: event.timestamp,
      phase: derivePhase(this.state.phase, event.type),
    };

    switch (event.type) {
      case "ParticipantJoined":
        next.participantCount = this.state.participantCount + 1;
        break;
      case "ParticipantLeft":
        next.participantCount = Math.max(0, this.state.participantCount - 1);
        break;
      case "ArtifactSubmitted":
        next.artifactCount = this.state.artifactCount + 1;
        break;
      case "ConflictsDetected": {
        const e = event as ConflictsDetected;
        next.conflictCount = this.state.conflictCount + e.conflicts.length;
        break;
      }
      case "ResolutionRecorded":
        next.resolvedCount = this.state.resolvedCount + 1;
        break;
      case "ItemFlagged":
        next.flagCount = this.state.flagCount + 1;
        break;
    }

    this.state = next;
  }

  getState(): ProtocolState {
    return { ...this.state };
  }

  reset(): void {
    this.state = emptyProtocolState();
  }
}

// ---------------------------------------------------------------------------
// ProjectionEngine
// ---------------------------------------------------------------------------

export class ProjectionEngine {
  private readonly projections: Map<string, Projection<unknown>>;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly eventStore: EventStore,
    projections: Record<string, Projection<unknown>>
  ) {
    this.projections = new Map(Object.entries(projections));
    // Subscribe to live events
    this.unsubscribe = this.eventStore.subscribe((event) => {
      for (const projection of this.projections.values()) {
        projection.apply(event);
      }
    });
  }

  /**
   * Reset all projections and replay all stored events for the given session.
   * Use this to rebuild read models from the event log after startup or
   * after a projection is added late.
   */
  rebuild(sessionCode: string): void {
    for (const projection of this.projections.values()) {
      projection.reset();
    }
    this.eventStore.replay(sessionCode, (event) => {
      for (const projection of this.projections.values()) {
        projection.apply(event);
      }
    });
  }

  /**
   * Retrieve the current read model for a named projection.
   * Returns undefined if no projection with that name is registered.
   */
  getProjection<T>(name: string): T | undefined {
    const projection = this.projections.get(name);
    return projection ? (projection.getState() as T) : undefined;
  }

  /**
   * Stop listening for new events. Call this when tearing down the engine.
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
