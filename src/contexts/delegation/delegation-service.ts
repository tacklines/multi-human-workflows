import type { DelegationLevel, PendingApproval } from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type {
  DelegationChanged,
  ApprovalRequested,
  ApprovalDecided,
} from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// DelegationService — agent autonomy and approval-loop operations for the
// Delegation bounded context (Phase VI — Build / Phase VII — Ship)
// ---------------------------------------------------------------------------

/**
 * Per-session store of pending approval requests.
 * Keyed by sessionCode, then by approvalId.
 * Lives on the service (not on Session) to avoid cascading Session interface changes.
 */
type ApprovalMap = Map<string, Map<string, PendingApproval>>;

/** Default approval expiry: 24 hours in seconds, converted to ms for Date arithmetic. */
const DEFAULT_EXPIRY_SECONDS = 86_400;

export class DelegationService {
  private readonly getSession: (code: string) => Session | null;
  private readonly eventStore: EventStore | null;

  /** Nested map: sessionCode -> approvalId -> PendingApproval */
  private readonly approvals: ApprovalMap = new Map();

  constructor(
    getSession: (code: string) => Session | null,
    eventStore?: EventStore
  ) {
    this.getSession = getSession;
    this.eventStore = eventStore ?? null;
  }

  // ---------------------------------------------------------------------------
  // setDelegationLevel
  // ---------------------------------------------------------------------------

  /**
   * Change the agent autonomy level for the session.
   * Returns the new level on success, or null if the session is not found.
   */
  setDelegationLevel(
    code: string,
    level: DelegationLevel,
    changedBy: string = 'system'
  ): DelegationLevel | null {
    const session = this.getSession(code);
    if (!session) return null;

    const timestamp = new Date().toISOString();

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'DelegationChanged',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp,
        level,
        changedBy,
      } satisfies DelegationChanged);
    }

    return level;
  }

  // ---------------------------------------------------------------------------
  // requestApproval
  // ---------------------------------------------------------------------------

  /**
   * Agent proposes an action and adds it to the pending approval queue.
   * Returns the created PendingApproval on success, or null if the session is not found.
   * The expiresAt defaults to 24 hours from now if not specified in the request.
   */
  requestApproval(
    code: string,
    request: Omit<PendingApproval, 'id' | 'expiresAt'> & { expiresAt?: string }
  ): PendingApproval | null {
    const session = this.getSession(code);
    if (!session) return null;

    const approvalId = generateId();
    const timestamp = new Date().toISOString();
    const expiresAt =
      request.expiresAt ??
      new Date(Date.now() + DEFAULT_EXPIRY_SECONDS * 1000).toISOString();

    const approval: PendingApproval = {
      id: approvalId,
      agentId: request.agentId,
      action: request.action,
      reasoning: request.reasoning,
      expiresAt,
    };

    // Store in service-level map
    if (!this.approvals.has(session.code)) {
      this.approvals.set(session.code, new Map());
    }
    this.approvals.get(session.code)!.set(approvalId, approval);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ApprovalRequested',
        eventId: approvalId,
        sessionCode: session.code,
        timestamp,
        agentId: request.agentId,
        action: request.action,
        reasoning: request.reasoning,
        expiresAt,
      } satisfies ApprovalRequested);
    }

    return approval;
  }

  // ---------------------------------------------------------------------------
  // decideApproval
  // ---------------------------------------------------------------------------

  /**
   * Human accepts or rejects a pending approval request.
   * Returns the updated PendingApproval on success.
   * Returns null if:
   *   - session not found
   *   - approvalId not found
   *   - approval has already expired
   */
  decideApproval(
    code: string,
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string
  ): PendingApproval | null {
    const session = this.getSession(code);
    if (!session) return null;

    const sessionApprovals = this.approvals.get(session.code);
    if (!sessionApprovals) return null;

    const approval = sessionApprovals.get(approvalId);
    if (!approval) return null;

    // Reject if expired
    if (new Date(approval.expiresAt) <= new Date()) return null;

    const timestamp = new Date().toISOString();

    // Remove from pending queue
    sessionApprovals.delete(approvalId);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'ApprovalDecided',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp,
        approvalId,
        decision,
        decidedBy,
      } satisfies ApprovalDecided);
    }

    return approval;
  }

  // ---------------------------------------------------------------------------
  // getPendingApprovals
  // ---------------------------------------------------------------------------

  /**
   * Return all pending (non-expired) approval requests for the session.
   * Returns null if the session is not found.
   * Expired approvals are filtered out but not automatically removed from storage.
   */
  getPendingApprovals(code: string): PendingApproval[] | null {
    const session = this.getSession(code);
    if (!session) return null;

    const sessionApprovals = this.approvals.get(session.code);
    if (!sessionApprovals) return [];

    const now = new Date();
    return Array.from(sessionApprovals.values()).filter(
      (a) => new Date(a.expiresAt) > now
    );
  }
}
