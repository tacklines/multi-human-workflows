export interface SessionParticipant {
  id: string;
  display_name: string;
  participant_type: 'human' | 'agent';
  sponsor_id: string | null;
  joined_at: string;
  is_online: boolean;
}

export interface SessionView {
  id: string;
  code: string;
  name: string | null;
  project_id: string;
  project_name: string;
  created_at: string;
  participants: SessionParticipant[];
}

export interface SessionState {
  code: string;
  participantId: string;
  session: SessionView;
  agentCode: string;
}

export interface AppState {
  sessionState: SessionState | null;
}

export type AppStateEvent =
  | { type: 'session-connected'; code: string; participantId: string }
  | { type: 'session-updated' }
  | { type: 'session-disconnected' }
  | { type: 'tasks-changed' }
  | { type: 'activity-changed' }
  | { type: 'questions-changed' }
  | { type: 'notes-changed' }
  | { type: 'mentioned'; taskId: string; commentId: string };

type Listener = (event: AppStateEvent) => void;

class Store {
  private state: AppState = {
    sessionState: null,
  };

  private listeners = new Set<Listener>();

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(event: AppStateEvent) {
    for (const fn of this.listeners) fn(event);
  }

  setSession(code: string, participantId: string, session: SessionView, agentCode: string) {
    // Mark self as online — the HTTP response may say false because WS isn't connected yet
    const fixedSession: SessionView = {
      ...session,
      participants: session.participants.map((p) =>
        p.id === participantId ? { ...p, is_online: true } : p
      ),
    };
    this.state = {
      ...this.state,
      sessionState: { code, participantId, session: fixedSession, agentCode },
    };
    this.notify({ type: 'session-connected', code, participantId });
  }

  updateSession(session: SessionView) {
    if (!this.state.sessionState) return;
    this.state = {
      ...this.state,
      sessionState: { ...this.state.sessionState, session },
    };
    this.notify({ type: 'session-updated' });
  }

  clearSession() {
    this.state = { ...this.state, sessionState: null };
    this.notify({ type: 'session-disconnected' });
  }

  notifyTasksChanged() {
    this.notify({ type: 'tasks-changed' });
  }

  notifyActivityChanged() {
    this.notify({ type: 'activity-changed' });
  }

  notifyQuestionsChanged() {
    this.notify({ type: 'questions-changed' });
  }

  notifyNotesChanged() {
    this.notify({ type: 'notes-changed' });
  }

  notifyMentioned(taskId: string, commentId: string) {
    this.notify({ type: 'mentioned', taskId, commentId });
  }
}

export const store = new Store();
