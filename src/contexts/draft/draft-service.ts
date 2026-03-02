import type { Draft, CandidateEventsFile } from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type { DraftCreated, DraftPublished } from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// DraftService — draft authoring operations for the Draft bounded context
// (Phase V — Agree / authoring)
// ---------------------------------------------------------------------------

export class DraftService {
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
   * Create a new draft in the session.
   * Emits DraftCreated.
   * Returns the full Draft, or null if the session does not exist.
   */
  createDraft(
    code: string,
    input: Omit<Draft, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt'>
  ): Draft | null {
    const session = this.getSession(code);
    if (!session) return null;

    const now = new Date().toISOString();
    const draft: Draft = {
      ...input,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    session.drafts.push(draft);

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'DraftCreated',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: now,
        participantId: draft.participantId,
        draftId: draft.id,
        content: draft.content,
      } satisfies DraftCreated);
    }

    return draft;
  }

  /**
   * Get a single draft by ID.
   * Returns null if the session or draft does not exist.
   */
  getDraft(code: string, draftId: string): Draft | null {
    const session = this.getSession(code);
    if (!session) return null;
    return session.drafts.find((d) => d.id === draftId) ?? null;
  }

  /**
   * Return all drafts for the session.
   * Returns null if the session does not exist.
   */
  getDrafts(code: string): Draft[] | null {
    const session = this.getSession(code);
    if (!session) return null;
    return [...session.drafts];
  }

  /**
   * Update a draft's mutable fields (title not on Draft — only content is updatable).
   * Sets updatedAt to now.
   * Returns the updated Draft, or null if the session or draft does not exist.
   */
  updateDraft(
    code: string,
    draftId: string,
    updates: Partial<Pick<Draft, 'content'>>
  ): Draft | null {
    const session = this.getSession(code);
    if (!session) return null;

    const index = session.drafts.findIndex((d) => d.id === draftId);
    if (index === -1) return null;

    const existing = session.drafts[index];
    const updated: Draft = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    session.drafts[index] = updated;
    return updated;
  }

  /**
   * Publish a draft.
   * Sets publishedAt to now. Emits DraftPublished.
   * Returns the published Draft, or null if the session or draft does not exist.
   * If the draft is already published, returns the existing draft without re-emitting.
   */
  publishDraft(code: string, draftId: string): Draft | null {
    const session = this.getSession(code);
    if (!session) return null;

    const index = session.drafts.findIndex((d) => d.id === draftId);
    if (index === -1) return null;

    const existing = session.drafts[index];

    // Idempotency: if already published, return the existing draft
    if (existing.publishedAt !== null) return existing;

    const publishedAt = new Date().toISOString();
    const published: Draft = {
      ...existing,
      publishedAt,
      updatedAt: publishedAt,
    };
    session.drafts[index] = published;

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'DraftPublished',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: publishedAt,
        draftId: published.id,
      } satisfies DraftPublished);
    }

    return published;
  }

  /**
   * Soft-delete a draft by removing it from the session.
   * Returns true if the draft was found and removed, false otherwise.
   */
  deleteDraft(code: string, draftId: string): boolean {
    const session = this.getSession(code);
    if (!session) return false;

    const index = session.drafts.findIndex((d) => d.id === draftId);
    if (index === -1) return false;

    session.drafts.splice(index, 1);
    return true;
  }
}
