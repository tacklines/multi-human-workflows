/**
 * AgreementService — domain service for jam (collaborative conflict resolution) operations.
 *
 * Extracts jam operations from SessionStore into a bounded-context service.
 * Accepts a narrow session accessor rather than the full SessionStore to keep
 * dependencies minimal.
 */

import type {
  JamArtifacts,
  ConflictResolution,
  OwnershipAssignment,
  UnresolvedItem,
} from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import type { EventStore } from '../session/event-store.js';

export type SessionAccessor = (code: string) => Session | null;

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class AgreementService {
  private getSession: SessionAccessor;
  private eventStore: EventStore;

  constructor(getSession: SessionAccessor, eventStore: EventStore) {
    this.getSession = getSession;
    this.eventStore = eventStore;
  }

  startJam(code: string): JamArtifacts | null {
    const session = this.getSession(code);
    if (!session) return null;
    if (session.jam) return session.jam;
    session.jam = {
      startedAt: new Date().toISOString(),
      ownershipMap: [],
      resolutions: [],
      unresolved: [],
    };
    this.eventStore.append('JamStarted', { code });
    return session.jam;
  }

  resolveConflict(
    code: string,
    resolution: Omit<ConflictResolution, 'resolvedAt'>
  ): ConflictResolution | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    const full: ConflictResolution = {
      ...resolution,
      resolvedAt: new Date().toISOString(),
    };
    session.jam.resolutions.push(full);
    this.eventStore.append('ConflictResolved', { code, overlapLabel: resolution.overlapLabel });
    return full;
  }

  assignOwnership(
    code: string,
    assignment: Omit<OwnershipAssignment, 'assignedAt'>
  ): OwnershipAssignment | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    const full: OwnershipAssignment = {
      ...assignment,
      assignedAt: new Date().toISOString(),
    };
    // Replace existing assignment for the same aggregate
    session.jam.ownershipMap = session.jam.ownershipMap.filter(
      (o) => o.aggregate !== full.aggregate
    );
    session.jam.ownershipMap.push(full);
    this.eventStore.append('OwnershipAssigned', { code, aggregate: assignment.aggregate });
    return full;
  }

  flagUnresolved(
    code: string,
    item: Omit<UnresolvedItem, 'id' | 'flaggedAt'>
  ): UnresolvedItem | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    const full: UnresolvedItem = {
      ...item,
      id: generateId(),
      flaggedAt: new Date().toISOString(),
    };
    session.jam.unresolved.push(full);
    this.eventStore.append('ItemFlagged', { code, description: item.description });
    return full;
  }

  exportJam(code: string): JamArtifacts | null {
    const session = this.getSession(code);
    if (!session?.jam) return null;
    return session.jam;
  }
}
