/**
 * Session connection lifecycle manager.
 *
 * Manages the EventSource (SSE) connection and updates the app-level store
 * when session events arrive. Lives in state/ so components don't need to
 * own connection lifecycle — navigation away no longer drops state.
 *
 * Architecture: state/ must not import from components/. No Lit imports here.
 */

import { store } from './app-state.js';
import type { ActiveSession, SessionParticipant, SessionSubmission } from './app-state.js';

const API_BASE = 'http://localhost:3002';

let activeEventSource: EventSource | null = null;

/**
 * Connect to the SSE stream for a session.
 * Updates the store when participant or submission events arrive.
 * Safe to call multiple times — closes any existing connection first.
 */
export function connectSession(code: string): void {
  disconnectSession();

  const es = new EventSource(`${API_BASE}/api/sessions/${code}/events`);

  es.addEventListener('participant', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data as string) as {
        participantId?: string;
        session?: ActiveSession;
      };
      // Server sends the full updated session snapshot on participant events
      if (data.session) {
        store.updateSession(data.session);
        return;
      }
      // Fallback: merge a single participant into existing session
      const participant = data as unknown as SessionParticipant;
      const current = store.get().sessionState;
      if (!current) return;
      const already = current.session.participants.find((p) => p.id === participant.id);
      if (!already) {
        store.updateSession({
          ...current.session,
          participants: [...current.session.participants, participant],
        });
      }
    } catch {
      // ignore malformed events
    }
  });

  es.addEventListener('submission', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data as string) as {
        submission?: SessionSubmission;
      };
      const submission = data.submission;
      if (!submission) return;
      const current = store.get().sessionState;
      if (!current) return;
      const already = current.session.submissions.find(
        (s) => s.participantId === submission.participantId && s.fileName === submission.fileName
      );
      if (!already) {
        store.updateSession({
          ...current.session,
          submissions: [...current.session.submissions, submission],
        });
      }
    } catch {
      // ignore malformed events
    }
  });

  es.onerror = () => {
    // SSE may disconnect and reconnect automatically; non-fatal
  };

  activeEventSource = es;
}

/**
 * Disconnect from the SSE stream and clear session state from the store.
 * Safe to call even if no connection is active.
 */
export function disconnectSession(): void {
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
}
