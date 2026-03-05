import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchProject, fetchProjectSessions, type ProjectView } from '../../state/project-api.js';
import { store, type SessionView } from '../../state/app-state.js';
import { connectSession } from '../../state/session-connection.js';
import { authStore } from '../../state/auth-state.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';

import '../tasks/task-board.js';

const API_BASE = '';

@customElement('project-workspace')
export class ProjectWorkspace extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 100%; }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    .workspace {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 100%;
    }

    .workspace-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-color);
      background: var(--surface-2);
    }

    .back-link {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--text-tertiary);
      cursor: pointer;
      font-size: 0.85rem;
    }
    .back-link:hover { color: var(--sl-color-primary-400); }

    .workspace-header h2 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .workspace-header .prefix {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    sl-tab-group {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-group::part(body) {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-panel::part(base) {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 0;
    }

    task-board {
      flex: 1;
    }

    .sessions-panel {
      padding: 1rem;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 48rem;
    }

    .session-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      background: var(--surface-card);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }

    .session-row:hover {
      border-color: var(--color-primary-border);
      background: var(--surface-active);
    }

    .session-row .code {
      font-family: var(--sl-font-mono);
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--sl-color-primary-400);
      letter-spacing: 0.08em;
      min-width: 5rem;
    }

    .session-row .name {
      flex: 1;
      color: var(--text-primary);
      font-size: 0.9rem;
    }

    .session-row .participants {
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .session-row .date {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .new-session-form {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
      margin-bottom: 1rem;
      max-width: 48rem;
    }

    .new-session-form sl-input {
      flex: 1;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-tertiary);
    }
  `;

  @property({ attribute: 'project-id' }) projectId = '';

  @state() private _project: ProjectView | null = null;
  @state() private _sessions: SessionView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _newSessionName = '';
  @state() private _creatingSess = false;
  @state() private _activeTab = 'tasks';

  private _appUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadProject();
    this._appUnsub = store.subscribe((event) => {
      if (event.type === 'session-connected') {
        // Switched to in-session mode, app-shell will handle
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._appUnsub?.();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('projectId') && this.projectId) {
      this._loadProject();
    }
  }

  private async _loadProject() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = '';
    try {
      const [project, sessions] = await Promise.all([
        fetchProject(this.projectId),
        fetchProjectSessions(this.projectId),
      ]);
      this._project = project;
      this._sessions = sessions;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load project';
    } finally {
      this._loading = false;
    }
  }

  private async _createSession() {
    this._creatingSess = true;
    this._error = '';
    try {
      const token = authStore.getAccessToken();
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          project_id: this.projectId,
          name: this._newSessionName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data = await res.json();
      store.setSession(data.session.code, data.session.participants[0]?.id, data.session, data.agent_code);
      connectSession(data.session.code);
      window.location.hash = `#session/${data.session.code}`;
      this._newSessionName = '';
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to create session';
    } finally {
      this._creatingSess = false;
    }
  }

  private async _joinSession(code: string) {
    const token = authStore.getAccessToken();
    const user = authStore.user;
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${code}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ display_name: user?.name ?? 'Participant' }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data = await res.json();
      store.setSession(code, data.participant_id, data.session, data.agent_code);
      connectSession(code);
      window.location.hash = `#session/${code}`;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to join session';
    }
  }

  private _formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  private _onlineCount(session: SessionView): number {
    return session.participants.filter(p => p.is_online).length;
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner style="font-size: 2rem;"></sl-spinner></div>`;
    }

    if (!this._project) {
      return html`<div class="empty-state">Project not found</div>`;
    }

    return html`
      <div class="workspace">
        <div class="workspace-header">
          <span class="back-link" role="button" tabindex="0"
                @click=${() => { window.location.hash = '#projects'; }}>
            <sl-icon name="arrow-left"></sl-icon> Projects
          </span>
          <h2>${this._project.name}</h2>
          <span class="prefix">${this._project.ticket_prefix}</span>
        </div>

        ${this._error ? html`<sl-alert variant="danger" open style="margin: 0.5rem 1rem;">${this._error}</sl-alert>` : nothing}

        <sl-tab-group @sl-tab-show=${(e: CustomEvent) => { this._activeTab = (e.detail as { name: string }).name; }}>
          <sl-tab slot="nav" panel="tasks">Tasks</sl-tab>
          <sl-tab slot="nav" panel="sessions">
            Sessions
            <sl-badge variant="neutral" pill style="margin-left: 0.3rem;">${this._sessions.length}</sl-badge>
          </sl-tab>

          <sl-tab-panel name="tasks">
            <task-board
              project-id=${this.projectId}
              session-code=""
              session-name=""
              .participants=${[]}
            ></task-board>
          </sl-tab-panel>

          <sl-tab-panel name="sessions">
            <div class="sessions-panel">
              <div class="new-session-form">
                <sl-input placeholder="Session name (optional)"
                          size="small"
                          value=${this._newSessionName}
                          @sl-input=${(e: CustomEvent) => { this._newSessionName = (e.target as HTMLInputElement).value; }}
                          @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createSession(); }}
                ></sl-input>
                <sl-button variant="primary" size="small" ?loading=${this._creatingSess}
                           @click=${() => void this._createSession()}>
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  New Session
                </sl-button>
              </div>

              ${this._sessions.length === 0 ? html`
                <div class="empty-state">No sessions yet. Create one to start collaborating.</div>
              ` : html`
                <div class="session-list">
                  ${this._sessions.map(s => html`
                    <div class="session-row" role="button" tabindex="0"
                         @click=${() => void this._joinSession(s.code)}
                         @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this._joinSession(s.code); } }}>
                      <span class="code">${s.code}</span>
                      <span class="name">${s.name || 'Untitled session'}</span>
                      <span class="participants">
                        ${this._onlineCount(s)} online / ${s.participants.length} total
                      </span>
                      <span class="date">${this._formatDate(s.created_at)}</span>
                    </div>
                  `)}
                </div>
              `}
            </div>
          </sl-tab-panel>
        </sl-tab-group>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'project-workspace': ProjectWorkspace;
  }
}
