import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchProject, fetchProjectSessions, type ProjectView } from '../../state/project-api.js';
import { fetchProjectTasks } from '../../state/task-api.js';
import { fetchPlans, type PlanListView } from '../../state/plan-api.js';
import type { TaskView, TaskStatus } from '../../state/task-types.js';
import { TASK_TYPE_ICONS, TASK_TYPE_COLORS, STATUS_LABELS, STATUS_VARIANTS, PRIORITY_ICONS, PRIORITY_COLORS } from '../../state/task-types.js';
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
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

import '../plans/plan-list.js';
import '../plans/plan-detail.js';

const API_BASE = '';

@customElement('project-workspace')
export class ProjectWorkspace extends LitElement {
  static styles = css`
    :host { display: block; flex: 1; }

    .container {
      min-height: 100%;
      padding: 2rem;
      background: var(--surface-1, #111320);
    }

    .inner {
      max-width: 64rem;
      margin: 0 auto;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    /* ── Project header ── */
    .project-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }

    .back-link {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--text-tertiary);
      cursor: pointer;
      font-size: 0.85rem;
      text-decoration: none;
      flex-shrink: 0;
    }
    .back-link:hover { color: var(--sl-color-primary-400); }

    .project-header h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prefix-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    /* ── Repo info ── */
    .repo-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      font-size: 0.85rem;
    }

    .repo-info sl-icon {
      font-size: 1rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .repo-link {
      color: var(--sl-color-primary-400);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .repo-link:hover {
      text-decoration: underline;
    }

    .branch-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    /* ── Section headers ── */
    .section {
      margin-bottom: 2rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* ── Sessions grid ── */
    .sessions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.75rem;
    }

    .session-card {
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: var(--surface-card);
      box-shadow: var(--shadow-xs);
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    }

    .session-card:hover {
      border-color: var(--color-primary-border);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .session-card .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .session-card .code {
      font-family: var(--sl-font-mono);
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--sl-color-primary-400);
      letter-spacing: 0.08em;
    }

    .session-card .date {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .session-card .name {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-card .participants {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .session-card .participants sl-icon {
      font-size: 0.85rem;
    }

    .online-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
      margin-right: 0.15rem;
    }

    .new-session-card {
      cursor: pointer;
      border: 2px dashed var(--border-medium);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--text-tertiary);
      transition: border-color 0.2s, color 0.2s;
      min-height: 100px;
    }

    .new-session-card:hover {
      border-color: var(--sl-color-primary-500);
      color: var(--sl-color-primary-400);
    }

    .new-session-card sl-icon {
      font-size: 1.25rem;
    }

    /* ── Stats row ── */
    .stats-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .stat-chip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      border-radius: var(--sl-border-radius-pill);
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .stat-chip .count {
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-chip.active {
      border-color: var(--color-primary-border);
      background: var(--surface-active);
    }

    /* ── Task list ── */
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .task-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      background: var(--surface-card);
      cursor: default;
      font-size: 0.875rem;
    }

    .task-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .task-row .type-icon {
      font-size: 0.9rem;
      flex-shrink: 0;
    }

    .task-row .ticket-id {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
      min-width: 5rem;
    }

    .task-row .task-title {
      flex: 1;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-row .priority-icon {
      font-size: 0.8rem;
      flex-shrink: 0;
    }

    .task-row sl-badge::part(base) {
      font-size: 0.7rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-tertiary);
      font-size: 0.9rem;
    }

    .empty-state sl-icon {
      font-size: 2rem;
      display: block;
      margin: 0 auto 0.75rem;
      opacity: 0.5;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  @property({ attribute: 'project-id' }) projectId = '';

  @state() private _project: ProjectView | null = null;
  @state() private _sessions: SessionView[] = [];
  @state() private _tasks: TaskView[] = [];
  @state() private _taskCounts = { open: 0, in_progress: 0, done: 0, closed: 0, total: 0 };
  @state() private _plans: PlanListView[] = [];
  @state() private _planCount = 0;
  @state() private _selectedPlanId: string | null = null;
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _showNewSession = false;
  @state() private _newSessionName = '';
  @state() private _creatingSess = false;

  private _appUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadProject();
    this._appUnsub = store.subscribe((event) => {
      if (event.type === 'session-connected') {
        // app-shell handles the switch
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
      const [project, sessions, allTasks, plans] = await Promise.all([
        fetchProject(this.projectId),
        fetchProjectSessions(this.projectId),
        fetchProjectTasks(this.projectId),
        fetchPlans(this.projectId),
      ]);
      this._project = project;
      this._sessions = sessions;
      this._plans = plans;
      this._planCount = plans.length;

      // Compute counts from all tasks
      const counts = { open: 0, in_progress: 0, done: 0, closed: 0, total: allTasks.length };
      for (const t of allTasks) {
        counts[t.status as keyof typeof counts] = (counts[t.status as keyof typeof counts] as number) + 1;
      }
      this._taskCounts = counts;

      // Show only open + in_progress tasks, sorted by updated_at desc, capped at 25
      this._tasks = allTasks
        .filter(t => t.status === 'open' || t.status === 'in_progress')
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 25);
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
      this._showNewSession = false;
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

  private _relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner style="font-size: 2rem;"></sl-spinner></div>`;
    }

    if (!this._project) {
      return html`<div class="empty-state">Project not found</div>`;
    }

    return html`
      <div class="container">
        <div class="inner">
          ${this._renderHeader()}
          ${this._renderRepo()}
          ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem;">${this._error}</sl-alert>` : nothing}
          ${this._renderSessions()}
          ${this._renderPlans()}
          ${this._renderTasks()}
        </div>
      </div>

      <sl-dialog label="New Session" ?open=${this._showNewSession}
                 @sl-after-hide=${() => { this._showNewSession = false; }}>
        <div class="dialog-form">
          <sl-input label="Session Name" placeholder="e.g. Sprint Planning"
                    help-text="Optional — give it a name to help others find it"
                    value=${this._newSessionName}
                    @sl-input=${(e: CustomEvent) => { this._newSessionName = (e.target as HTMLInputElement).value; }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createSession(); }}
          ></sl-input>
        </div>
        <sl-button slot="footer" variant="primary" ?loading=${this._creatingSess}
                   @click=${() => void this._createSession()}>
          Create Session
        </sl-button>
      </sl-dialog>
    `;
  }

  private _renderHeader() {
    const p = this._project!;
    return html`
      <div class="project-header">
        <span class="back-link" role="button" tabindex="0"
              @click=${() => { window.location.hash = '#projects'; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') window.location.hash = '#projects'; }}>
          <sl-icon name="arrow-left"></sl-icon> Projects
        </span>
        <h1>${p.name}</h1>
        <span class="prefix-badge">${p.ticket_prefix}</span>
      </div>
    `;
  }

  private _renderRepo() {
    const p = this._project!;
    if (!p.repo_url) return nothing;
    return html`
      <div class="repo-info">
        <sl-icon name="github"></sl-icon>
        <a class="repo-link" href=${p.repo_url} target="_blank" rel="noopener noreferrer">${p.repo_url}</a>
        ${p.default_branch ? html`<span class="branch-badge">${p.default_branch}</span>` : nothing}
      </div>
    `;
  }

  private _renderSessions() {
    const active = this._sessions.filter(s => this._onlineCount(s) > 0);
    const inactive = this._sessions.filter(s => this._onlineCount(s) === 0);

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="people-fill"></sl-icon>
            Sessions
            <sl-badge variant="neutral" pill>${this._sessions.length}</sl-badge>
          </span>
        </div>

        <div class="sessions-grid">
          ${active.map(s => this._renderSessionCard(s, true))}
          ${inactive.slice(0, 8).map(s => this._renderSessionCard(s, false))}

          <div class="new-session-card" role="button" tabindex="0"
               @click=${() => { this._showNewSession = true; }}
               @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._showNewSession = true; } }}>
            <sl-icon name="plus-lg"></sl-icon>
            <span>New Session</span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSessionCard(s: SessionView, hasOnline: boolean) {
    const online = this._onlineCount(s);
    return html`
      <div class="session-card" role="button" tabindex="0"
           @click=${() => void this._joinSession(s.code)}
           @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this._joinSession(s.code); } }}>
        <div class="card-top">
          <span class="code">${s.code}</span>
          <span class="date">${this._formatDate(s.created_at)}</span>
        </div>
        <div class="name">${s.name || 'Untitled session'}</div>
        <div class="participants">
          ${hasOnline ? html`<span class="online-dot"></span>` : nothing}
          <sl-icon name="people"></sl-icon>
          ${hasOnline
            ? html`${online} online`
            : html`${s.participants.length} participant${s.participants.length !== 1 ? 's' : ''}`}
        </div>
      </div>
    `;
  }

  private _renderPlans() {
    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="file-earmark-text"></sl-icon>
            Plans
            <sl-badge variant="neutral" pill>${this._planCount}</sl-badge>
          </span>
        </div>

        ${this._selectedPlanId ? html`
          <plan-detail
            .projectId=${this.projectId}
            .planId=${this._selectedPlanId}
            @plan-back=${() => { this._selectedPlanId = null; }}
          ></plan-detail>
        ` : html`
          <plan-list
            .projectId=${this.projectId}
            @plan-select=${(e: CustomEvent) => { this._selectedPlanId = e.detail.planId; }}
          ></plan-list>
        `}
      </div>
    `;
  }

  private _renderTasks() {
    const { open, in_progress, done, closed, total } = this._taskCounts;

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="kanban"></sl-icon>
            Tasks
            <sl-badge variant="neutral" pill>${total}</sl-badge>
          </span>
        </div>

        <div class="stats-row">
          <div class="stat-chip ${open > 0 ? 'active' : ''}">
            <span class="count">${open}</span> Open
          </div>
          <div class="stat-chip ${in_progress > 0 ? 'active' : ''}">
            <span class="count">${in_progress}</span> In Progress
          </div>
          <div class="stat-chip">
            <span class="count">${done}</span> Done
          </div>
          <div class="stat-chip">
            <span class="count">${closed}</span> Closed
          </div>
        </div>

        ${this._tasks.length === 0 ? html`
          <div class="empty-state">
            <sl-icon name="check-circle"></sl-icon>
            ${total === 0
              ? 'No tasks yet. Join a session to create tasks.'
              : 'All tasks are done or closed.'}
          </div>
        ` : html`
          <div class="task-list">
            ${this._tasks.map(t => html`
              <div class="task-row">
                <sl-icon class="type-icon" name=${TASK_TYPE_ICONS[t.task_type]}
                         style="color: ${TASK_TYPE_COLORS[t.task_type]}"></sl-icon>
                <span class="ticket-id">${t.ticket_id}</span>
                <span class="task-title">${t.title}</span>
                <sl-icon class="priority-icon" name=${PRIORITY_ICONS[t.priority]}
                         style="color: ${PRIORITY_COLORS[t.priority]}"></sl-icon>
                <sl-badge variant=${STATUS_VARIANTS[t.status]}>${STATUS_LABELS[t.status]}</sl-badge>
                <sl-tooltip content="Updated ${this._relativeTime(t.updated_at)}">
                  <span class="date" style="font-size: 0.75rem; color: var(--text-tertiary);">
                    ${this._relativeTime(t.updated_at)}
                  </span>
                </sl-tooltip>
              </div>
            `)}
          </div>
          ${this._tasks.length >= 25 ? html`
            <div style="text-align: center; margin-top: 0.75rem;">
              <span style="font-size: 0.8rem; color: var(--text-tertiary);">
                Showing 25 of ${open + in_progress} active tasks. Join a session for the full board.
              </span>
            </div>
          ` : nothing}
        `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'project-workspace': ProjectWorkspace;
  }
}
