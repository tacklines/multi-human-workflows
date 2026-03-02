import type {
  WorkItem,
  WorkItemDependency,
  CoverageEntry,
} from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type { WorkItemCreated, DependencySet } from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// DecompositionService — work item slicing operations for the Decomposition
// bounded context (Phase IV — Slice)
// ---------------------------------------------------------------------------

export class DecompositionService {
  private readonly getSession: (code: string) => Session | null;
  private readonly eventStore: EventStore | null;

  constructor(
    getSession: (code: string) => Session | null,
    eventStore?: EventStore
  ) {
    this.getSession = getSession;
    this.eventStore = eventStore ?? null;
  }

  /**
   * Create a new work item in the session.
   * Emits WorkItemCreated.
   * Returns the created WorkItem, or null if the session does not exist.
   */
  createWorkItem(
    code: string,
    item: Omit<WorkItem, 'id'>
  ): WorkItem | null {
    const session = this.getSession(code);
    if (!session) return null;

    const workItem: WorkItem = {
      ...item,
      id: generateId(),
    };

    session.workItems.push(workItem);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'WorkItemCreated',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: new Date().toISOString(),
        aggregate: workItem.linkedEvents[0] ?? '',
        workItem,
      } satisfies WorkItemCreated);
    }

    return workItem;
  }

  /**
   * Return all work items for the session.
   * Returns null if the session does not exist.
   */
  getDecomposition(code: string): WorkItem[] | null {
    const session = this.getSession(code);
    if (!session) return null;
    return [...session.workItems];
  }

  /**
   * Set a dependency between two work items.
   * Idempotent: if a dependency with the same fromId+toId already exists,
   * the existing record is returned without mutation.
   * Emits DependencySet on first creation.
   * Returns the dependency record, or null if the session does not exist.
   */
  setDependency(
    code: string,
    dependency: { fromId: string; toId: string; participantId: string }
  ): WorkItemDependency | null {
    const session = this.getSession(code);
    if (!session) return null;

    // Idempotency check: return existing if same fromId+toId already present
    const existing = session.workItemDependencies.find(
      (d) => d.fromId === dependency.fromId && d.toId === dependency.toId
    );
    if (existing) return existing;

    const setAt = new Date().toISOString();
    const record: WorkItemDependency = {
      fromId: dependency.fromId,
      toId: dependency.toId,
      participantId: dependency.participantId,
      setAt,
    };

    session.workItemDependencies.push(record);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'DependencySet',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: setAt,
        fromItemId: dependency.fromId,
        toItemId: dependency.toId,
      } satisfies DependencySet);
    }

    return record;
  }

  /**
   * Compute which domain events are covered by which work items.
   * A domain event is "covered" when at least one work item lists it in
   * its `linkedEvents` array.
   *
   * The matrix is derived from all work items in the session — no external
   * event catalog is required. Events that appear in `linkedEvents` across
   * all work items are collected and their coverage is computed.
   *
   * Returns null if the session does not exist.
   * Returns an empty array if no work items have been created.
   */
  getCoverageMatrix(code: string): CoverageEntry[] | null {
    const session = this.getSession(code);
    if (!session) return null;

    // Collect all unique event names referenced by any work item
    const allEventNames = new Set<string>();
    for (const item of session.workItems) {
      for (const eventName of item.linkedEvents) {
        allEventNames.add(eventName);
      }
    }

    const matrix: CoverageEntry[] = [];

    for (const eventName of allEventNames) {
      const workItemIds = session.workItems
        .filter((item) => item.linkedEvents.includes(eventName))
        .map((item) => item.id);

      matrix.push({
        eventName,
        workItemIds,
        covered: workItemIds.length > 0,
      });
    }

    // Sort alphabetically by event name for deterministic output
    matrix.sort((a, b) => a.eventName.localeCompare(b.eventName));

    return matrix;
  }
}
