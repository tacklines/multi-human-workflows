/** Types matching candidate-events.schema.json */

export type Confidence = 'CONFIRMED' | 'LIKELY' | 'POSSIBLE';

/** Protocol through which an artifact was submitted */
export type SubmissionProtocol = 'web' | 'mcp' | 'a2a';

/** Session lifecycle state machine */
export type SessionStatus = 'active' | 'paused' | 'closed';
export type SessionTransitionAction = 'pause' | 'resume' | 'close';
export type Direction = 'inbound' | 'outbound' | 'internal';
export type AssumptionType = 'ownership' | 'contract' | 'ordering' | 'existence';

export interface PayloadField {
  field: string;
  type: string;
}

export interface Integration {
  direction: Direction;
  channel?: string;
}

export interface DomainEvent {
  name: string;
  aggregate: string;
  trigger: string;
  payload: PayloadField[];
  state_change?: string;
  integration: Integration;
  sources?: string[];
  confidence: Confidence;
  notes?: string;
}

export interface BoundaryAssumption {
  id: string;
  type: AssumptionType;
  statement: string;
  affects_events: string[];
  confidence: Confidence;
  verify_with: string;
}

export interface CandidateEventsMetadata {
  role: string;
  scope: string;
  goal: string;
  generated_at: string;
  event_count: number;
  assumption_count: number;
}

export interface CandidateEventsFile {
  metadata: CandidateEventsMetadata;
  domain_events: DomainEvent[];
  boundary_assumptions: BoundaryAssumption[];
}

/** A loaded file with its parsed data and source info */
export interface LoadedFile {
  filename: string;
  role: string;
  data: CandidateEventsFile;
}

/** Jam session artifacts — outcomes from collaborative resolution */

export interface OwnershipAssignment {
  aggregate: string;
  ownerRole: string;
  assignedBy: string;
  assignedAt: string;
}

export interface ConflictResolution {
  overlapLabel: string;
  resolution: string;
  chosenApproach: string;
  resolvedBy: string[];
  resolvedAt: string;
}

export interface UnresolvedItem {
  id: string;
  description: string;
  relatedOverlap?: string;
  flaggedBy: string;
  flaggedAt: string;
}

/** Contract artifacts — output from /formalize */

export interface EventContract {
  eventName: string;
  aggregate: string;
  version: string;
  schema: Record<string, unknown>;
  owner: string;
  consumers: string[];
  producedBy: string;
}

export interface BoundaryContract {
  boundaryName: string;
  aggregates: string[];
  events: string[];
  owner: string;
  externalDependencies: string[];
}

export interface ContractBundle {
  generatedAt: string;
  sourceJamCode?: string;
  eventContracts: EventContract[];
  boundaryContracts: BoundaryContract[];
}

/** Integration report — output from /integrate */

export type IntegrationCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface IntegrationCheck {
  name: string;
  status: IntegrationCheckStatus;
  message: string;
  details?: string;
}

export interface IntegrationReport {
  generatedAt: string;
  sourceContracts: string[];
  checks: IntegrationCheck[];
  overallStatus: IntegrationCheckStatus;
  summary: string;
}

export interface JamArtifacts {
  startedAt: string;
  ownershipMap: OwnershipAssignment[];
  resolutions: ConflictResolution[];
  unresolved: UnresolvedItem[];
}

/** Priority tier for ranking domain events — MoSCoW-style classification */
export type PriorityTier = 'must_have' | 'should_have' | 'could_have';

/**
 * Composite priority record for a single domain event.
 * The compositeScore is computed from confidence, integration complexity,
 * and cross-references across participants.
 */
export interface EventPriority {
  /** Name of the domain event being prioritized */
  eventName: string;
  /** MoSCoW classification tier */
  tier: PriorityTier;
  /**
   * Computed score from three weighted signals:
   * - Confidence level (CONFIRMED=3, LIKELY=2, POSSIBLE=1)
   * - Integration complexity (inbound/outbound=2, internal=1)
   * - Cross-references (count of participants whose artifacts mention the event or aggregate)
   */
  compositeScore: number;
  /** Votes cast on this event by participants */
  votes: Vote[];
}

/** A single upvote or downvote cast by a participant on a domain event */
export interface Vote {
  /** Participant who cast the vote */
  participantId: string;
  /** Event this vote applies to */
  eventName: string;
  /** Direction of the vote */
  direction: 'up' | 'down';
}

/** Complexity estimate using T-shirt sizing */
export type WorkItemComplexity = 'S' | 'M' | 'L' | 'XL';

/**
 * A vertically-sliced unit of work derived from decomposing an aggregate.
 * Work items are independently deliverable and testable.
 */
export interface WorkItem {
  /** Unique identifier for the work item */
  id: string;
  /** Short, imperative title describing what gets built */
  title: string;
  /** Longer description providing context and rationale */
  description: string;
  /** List of testable acceptance criteria statements */
  acceptanceCriteria: string[];
  /** T-shirt size estimate of implementation effort */
  complexity: WorkItemComplexity;
  /** Names of domain events from the parent aggregate that this work item addresses */
  linkedEvents: string[];
  /** IDs of work items that must complete before this one can start */
  dependencies: string[];
}

/**
 * A draft artifact visible only to the author — a staging area before formal submission.
 * Created via `create_draft`, promoted via `submit_artifact`.
 */
export interface Draft {
  /** Unique identifier for the draft */
  id: string;
  /** Participant who authored this draft */
  participantId: string;
  /** The candidate events content being drafted */
  content: CandidateEventsFile;
  /** ISO 8601 timestamp when the draft was created */
  createdAt: string;
}

/**
 * Agent autonomy level for the current session.
 * Controls how much agents can do without explicit human approval.
 */
export type DelegationLevel = 'assisted' | 'semi_autonomous' | 'autonomous';

/**
 * An agent-proposed action awaiting human approval.
 * Used when delegation level is `assisted` or `semi_autonomous`.
 */
export interface PendingApproval {
  /** Unique identifier for this pending approval request */
  id: string;
  /** ID of the agent that proposed the action */
  agentId: string;
  /** Human-readable description of what the agent wants to do */
  action: string;
  /** Optional explanation from the agent for why it wants to take this action */
  reasoning?: string;
  /** ISO 8601 timestamp when this approval request expires (default: 24 hours after creation) */
  expiresAt: string;
}
