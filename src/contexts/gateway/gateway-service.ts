/**
 * GatewayService — Protocol Gateway Anti-Corruption Layer.
 *
 * Central command/query handler that sits between protocol adapters (MCP, HTTP)
 * and domain services (SessionStore, AgreementService). Protocol layers import
 * only GatewayService; business logic validation and composition will be added
 * here incrementally.
 */

import type { SessionStore } from '../../lib/session-store.js';
import { serializeSession } from '../../lib/session-store.js';
import type { AgreementService } from '../agreement/agreement-service.js';
import type { EventStore } from '../session/event-store.js';
import type {
  ConflictResolution,
  OwnershipAssignment,
  UnresolvedItem,
  ContractBundle,
  IntegrationReport,
  LoadedFile,
} from '../../schema/types.js';
import { computeWorkflowStatus, sessionToSessionData } from '../../lib/workflow-engine.js';
import { computeSessionStatus } from '../../lib/prep-completeness.js';
import { compareFiles } from '../../lib/comparison.js';
import type {
  CreateSessionResult,
  JoinSessionResult,
  SubmitResult,
  SessionView,
} from './types.js';
import type { WorkflowStatus } from '../../lib/workflow-engine.js';
import type { SessionPrepStatus } from '../../lib/prep-completeness.js';
import type { Overlap } from '../../lib/comparison.js';

export class GatewayService {
  private sessionStore: SessionStore;
  private agreementService: AgreementService;
  private eventStore: EventStore;

  constructor(
    sessionStore: SessionStore,
    agreementService: AgreementService,
    eventStore: EventStore
  ) {
    this.sessionStore = sessionStore;
    this.agreementService = agreementService;
    this.eventStore = eventStore;
  }

  // ---------------------------------------------------------------------------
  // Session commands
  // ---------------------------------------------------------------------------

  createSession(creatorName: string): CreateSessionResult {
    const { session, creatorId } = this.sessionStore.createSession(creatorName);
    return {
      session: serializeSession(session),
      creatorId,
      code: session.code,
    };
  }

  joinSession(code: string, participantName: string): JoinSessionResult | null {
    const result = this.sessionStore.joinSession(code, participantName);
    if (!result) return null;
    return {
      session: serializeSession(result.session),
      participantId: result.participantId,
    };
  }

  // ---------------------------------------------------------------------------
  // Artifact commands
  // ---------------------------------------------------------------------------

  submitArtifact(
    code: string,
    participantId: string,
    fileName: string,
    data: import('../../schema/types.js').CandidateEventsFile
  ): SubmitResult | null {
    const submission = this.sessionStore.submitYaml(code, participantId, fileName, data);
    if (!submission) return null;
    return { submittedAt: submission.submittedAt };
  }

  // ---------------------------------------------------------------------------
  // Query operations
  // ---------------------------------------------------------------------------

  getSession(code: string): SessionView | null {
    const session = this.sessionStore.getSession(code);
    if (!session) return null;
    return serializeSession(session);
  }

  getSessionFiles(code: string): LoadedFile[] {
    return this.sessionStore.getSessionFiles(code);
  }

  // ---------------------------------------------------------------------------
  // Agreement commands (delegated to AgreementService)
  // ---------------------------------------------------------------------------

  startJam(code: string): import('../../schema/types.js').JamArtifacts | null {
    return this.agreementService.startJam(code);
  }

  resolveConflict(
    code: string,
    resolution: Omit<ConflictResolution, 'resolvedAt'>
  ): ConflictResolution | null {
    return this.agreementService.resolveConflict(code, resolution);
  }

  assignOwnership(
    code: string,
    assignment: Omit<OwnershipAssignment, 'assignedAt'>
  ): OwnershipAssignment | null {
    return this.agreementService.assignOwnership(code, assignment);
  }

  flagUnresolved(
    code: string,
    item: Omit<UnresolvedItem, 'id' | 'flaggedAt'>
  ): UnresolvedItem | null {
    return this.agreementService.flagUnresolved(code, item);
  }

  exportJam(code: string): import('../../schema/types.js').JamArtifacts | null {
    return this.agreementService.exportJam(code);
  }

  // ---------------------------------------------------------------------------
  // Contract commands
  // ---------------------------------------------------------------------------

  loadContracts(code: string, bundle: ContractBundle): ContractBundle | null {
    return this.sessionStore.loadContracts(code, bundle);
  }

  getContracts(code: string): ContractBundle | null {
    return this.sessionStore.getContracts(code);
  }

  // ---------------------------------------------------------------------------
  // Integration commands
  // ---------------------------------------------------------------------------

  loadIntegrationReport(code: string, report: IntegrationReport): IntegrationReport | null {
    return this.sessionStore.loadIntegrationReport(code, report);
  }

  getIntegrationReport(code: string): IntegrationReport | null {
    return this.sessionStore.getIntegrationReport(code);
  }

  // ---------------------------------------------------------------------------
  // Workflow queries
  // ---------------------------------------------------------------------------

  getWorkflowPhase(code: string): WorkflowStatus | null {
    const session = this.sessionStore.getSession(code);
    if (!session) return null;
    return computeWorkflowStatus(sessionToSessionData(session));
  }

  getPrepStatus(code: string): SessionPrepStatus | null {
    const session = this.sessionStore.getSession(code);
    if (!session) return null;
    const files = this.sessionStore.getSessionFiles(code);
    return computeSessionStatus(files);
  }

  getComparisonResult(code: string): Overlap[] {
    const files = this.sessionStore.getSessionFiles(code);
    return compareFiles(files);
  }
}
