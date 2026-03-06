import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { fetchActivity, type ActivityEvent } from '../../state/task-api.js';
import { fetchMessages, sendMessage, fetchProjectAgent, type MessageView, type ProjectAgentDetailView } from '../../state/agent-api.js';
import { store, type SessionParticipant } from '../../state/app-state.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

const EVENT_ICONS: Record<string, string> = {
  task_created: 'plus-circle-fill',
  task_updated: 'pencil-fill',
  task_closed: 'check-circle-fill',
  task_deleted: 'trash-fill',
  comment_added: 'chat-left-text-fill',
  participant_joined: 'person-plus-fill',
  workspace_running: 'play-circle-fill',
  workspace_stopped: 'stop-circle-fill',
  workspace_failed: 'exclamation-triangle-fill',
};

const EVENT_COLORS: Record<string, string> = {
  task_created: 'var(--sl-color-success-500)',
  task_updated: 'var(--sl-color-primary-500)',
  task_closed: 'var(--sl-color-success-600)',
  task_deleted: 'var(--sl-color-danger-500)',
  comment_added: 'var(--sl-color-neutral-400)',
  participant_joined: 'var(--sl-color-teal-500)',
  workspace_running: 'var(--sl-color-success-500)',
  workspace_stopped: 'var(--sl-color-neutral-500)',
  workspace_failed: 'var(--sl-color-danger-500)',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  return t('time.daysAgo', { count: Math.floor(hours / 24) });
}

@customElement('agent-console')
export class AgentConsole extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 420px;
      max-width: 100vw;
      z-index: 900;
      pointer-events: none;
    }

    :host([open]) {
      pointer-events: auto;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }

    :host([open]) .backdrop {
      opacity: 1;
      pointer-events: auto;
    }

    .panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 420px;
      max-width: 100vw;
      background: var(--surface-1, #111320);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
    }

    :host([open]) .panel {
      transform: translateX(0);
    }

    /* -- Header -- */
    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .header-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--avatar-agent-gradient, linear-gradient(135deg, #6366f1, #a855f7));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      flex-shrink: 0;
      position: relative;
    }

    .header-avatar .sparkle {
      position: absolute;
      top: -2px;
      right: -2px;
      font-size: 12px;
      filter: drop-shadow(0 0 2px rgba(99, 102, 241, 0.5));
    }

    .header-info {
      flex: 1;
      min-width: 0;
    }

    .header-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.15rem;
    }

    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
    }

    .status-dot.offline {
      background: var(--text-muted, #6b7280);
    }

    .close-btn {
      flex-shrink: 0;
    }

    /* -- Tab content area -- */
    .tab-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    sl-tab-group {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-group::part(base) {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    sl-tab-group::part(body) {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    sl-tab-panel {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    sl-tab-panel::part(base) {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 0;
    }

    /* -- Messages tab -- */
    .messages-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .messages-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .message {
      max-width: 85%;
      padding: 0.5rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      line-height: 1.45;
      word-wrap: break-word;
    }

    .message.sent {
      align-self: flex-end;
      background: var(--sl-color-primary-600);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.received {
      align-self: flex-start;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
    }

    .message-time {
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 0.2rem;
    }

    .message.received .message-time {
      color: var(--text-tertiary);
    }

    .message-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      padding: 2rem;
      text-align: center;
    }

    .message-empty sl-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
      opacity: 0.5;
    }

    /* -- Compose bar -- */
    .compose {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border-subtle);
      background: var(--surface-2, #1a1d2e);
      flex-shrink: 0;
    }

    .compose sl-textarea {
      flex: 1;
    }

    .compose sl-textarea::part(base) {
      background: var(--surface-card);
      border-color: var(--border-subtle);
    }

    .compose sl-textarea::part(textarea) {
      font-size: 0.85rem;
      min-height: 36px;
      max-height: 120px;
    }

    .compose sl-button::part(base) {
      min-height: 36px;
    }

    /* -- Activity tab -- */
    .activity-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem 1rem;
    }

    .activity-event {
      display: flex;
      gap: 0.5rem;
      padding: 0.4rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      align-items: flex-start;
    }

    .activity-event:last-child {
      border-bottom: none;
    }

    .activity-icon {
      flex-shrink: 0;
      font-size: 0.75rem;
      margin-top: 0.15rem;
    }

    .activity-body {
      flex: 1;
      min-width: 0;
    }

    .activity-summary {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.35;
    }

    .activity-time {
      font-size: 0.65rem;
      color: var(--text-tertiary);
      margin-top: 0.1rem;
    }

    .activity-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      text-align: center;
    }

    .activity-empty sl-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    /* -- Workspace status -- */
    .workspace-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--surface-2, #1a1d2e);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .workspace-status sl-badge {
      font-size: 0.7rem;
    }

    /* -- Workspace tab -- */
    .workspace-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem 1rem;
    }

    .ws-card {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
    }

    .ws-card-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
      margin-bottom: 0.35rem;
    }

    .ws-card-value {
      font-size: 0.85rem;
      color: var(--text-primary);
      font-family: var(--sl-font-mono);
    }

    .ws-card-value.muted {
      color: var(--text-tertiary);
      font-family: inherit;
      font-style: italic;
    }

    .ws-status-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .ws-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .ws-status-badge.running {
      background: rgba(34, 197, 94, 0.15);
      color: var(--sl-color-success-500);
    }

    .ws-status-badge.stopped {
      background: rgba(107, 114, 128, 0.15);
      color: var(--text-tertiary);
    }

    .ws-status-badge.failed {
      background: rgba(239, 68, 68, 0.15);
      color: var(--sl-color-danger-500);
    }

    .ws-status-badge.pending, .ws-status-badge.creating {
      background: rgba(99, 102, 241, 0.15);
      color: var(--sl-color-primary-400);
    }

    .ws-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      text-align: center;
    }

    .ws-empty sl-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }

    .ws-task-card {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .ws-task-card .ticket-id {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--sl-color-primary-400);
      flex-shrink: 0;
    }

    .ws-task-card .title {
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    @media (max-width: 480px) {
      .panel { width: 100vw; }
      :host { width: 100vw; }
    }
  `;

  @property({ type: String, attribute: 'session-code' }) sessionCode = '';
  @property({ type: Object }) participant: SessionParticipant | null = null;
  @property({ type: Boolean, reflect: true }) open = false;

  @state() private _messages: MessageView[] = [];
  @state() private _activity: ActivityEvent[] = [];
  @state() private _agentDetail: ProjectAgentDetailView | null = null;
  @state() private _loadingMessages = false;
  @state() private _loadingActivity = false;
  @state() private _loadingWorkspace = false;
  @state() private _sendingMessage = false;
  @state() private _messageText = '';
  @state() private _activeTab = 'messages';

  @query('.messages-scroll') private _messagesScroll!: HTMLElement;

  private _storeUnsub: (() => void) | null = null;
  private _refreshInterval: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === 'activity-changed' || event.type === 'tasks-changed') {
        if (this.open && this.participant) {
          this._loadActivity();
          this._loadMessages();
        }
      }
    });
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._storeUnsub?.();
    this._stopRefresh();
    document.removeEventListener('keydown', this._onKeydown);
  }

  private _onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.open) {
      this._close();
    }
  };

  updated(changed: Map<string, unknown>) {
    if (changed.has('open') || changed.has('participant')) {
      if (this.open && this.participant) {
        this._loadMessages();
        this._loadActivity();
        this._loadAgentDetail();
        this._startRefresh();
      } else {
        this._stopRefresh();
      }
    }
  }

  private _startRefresh() {
    this._stopRefresh();
    this._refreshInterval = setInterval(() => {
      if (this.open && this.participant) {
        this._loadMessages();
        this._loadActivity();
      }
    }, 10000);
  }

  private _stopRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  private async _loadMessages() {
    if (!this.sessionCode || !this.participant) return;
    try {
      this._loadingMessages = this._messages.length === 0;
      this._messages = await fetchMessages(this.sessionCode, this.participant.id, { limit: 100 });
      await this.updateComplete;
      this._scrollToBottom();
    } catch {
      // silent
    } finally {
      this._loadingMessages = false;
    }
  }

  private async _loadActivity() {
    if (!this.sessionCode || !this.participant) return;
    try {
      this._loadingActivity = this._activity.length === 0;
      this._activity = await fetchActivity(this.sessionCode, {
        actor_id: this.participant.id,
        limit: 50,
      });
    } catch {
      // silent
    } finally {
      this._loadingActivity = false;
    }
  }

  private async _loadAgentDetail() {
    if (!this.participant) return;
    const projectId = store.get().sessionState?.session.project_id;
    if (!projectId) return;
    try {
      this._loadingWorkspace = !this._agentDetail;
      this._agentDetail = await fetchProjectAgent(projectId, this.participant.id);
    } catch {
      // Agent may not have a project-level record yet
    } finally {
      this._loadingWorkspace = false;
    }
  }

  private _scrollToBottom() {
    requestAnimationFrame(() => {
      if (this._messagesScroll) {
        this._messagesScroll.scrollTop = this._messagesScroll.scrollHeight;
      }
    });
  }

  private async _sendMessage() {
    if (!this._messageText.trim() || !this.sessionCode || !this.participant) return;
    this._sendingMessage = true;
    try {
      const msg = await sendMessage(this.sessionCode, this.participant.id, this._messageText.trim());
      this._messages = [...this._messages, msg];
      this._messageText = '';
      await this.updateComplete;
      this._scrollToBottom();
    } catch {
      // TODO: show error toast
    } finally {
      this._sendingMessage = false;
    }
  }

  private _onComposeKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private _getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  render() {
    const p = this.participant;
    if (!p) return nothing;

    const myId = store.get().sessionState?.participantId;

    return html`
      <div class="backdrop" @click=${this._close}></div>
      <div class="panel">
        ${this._renderHeader(p)}
        <div class="tab-area">
          <sl-tab-group @sl-tab-show=${(e: CustomEvent) => { this._activeTab = (e.detail as any).name; }}>
            <sl-tab slot="nav" panel="messages">
              ${t('agentConsole.tab.messages')}
              ${this._messages.length > 0 ? html`<sl-badge variant="primary" pill style="margin-left: 0.3rem">${this._messages.length}</sl-badge>` : nothing}
            </sl-tab>
            <sl-tab slot="nav" panel="activity">
              ${t('agentConsole.tab.activity')}
              ${this._activity.length > 0 ? html`<sl-badge variant="neutral" pill style="margin-left: 0.3rem">${this._activity.length}</sl-badge>` : nothing}
            </sl-tab>
            <sl-tab slot="nav" panel="workspace">${t('agentConsole.tab.workspace')}</sl-tab>

            <sl-tab-panel name="messages">
              ${this._renderMessages(myId)}
            </sl-tab-panel>
            <sl-tab-panel name="activity">
              ${this._renderActivity()}
            </sl-tab-panel>
            <sl-tab-panel name="workspace">
              ${this._renderWorkspace()}
            </sl-tab-panel>
          </sl-tab-group>
        </div>
      </div>
    `;
  }

  private _renderHeader(p: SessionParticipant) {
    const sponsor = p.sponsor_id
      ? store.get().sessionState?.session.participants.find(s => s.id === p.sponsor_id)
      : null;

    return html`
      <div class="header">
        <div class="header-avatar">
          ${this._getInitials(p.display_name)}
          <span class="sparkle" aria-hidden="true">&#10024;</span>
        </div>
        <div class="header-info">
          <div class="header-name">${p.display_name}</div>
          <div class="header-meta">
            <span class="status-dot ${p.is_online ? '' : 'offline'}"></span>
            ${p.is_online ? t('agentConsole.online') : t('agentConsole.offline')}
            ${sponsor ? html`<span>${t('agentConsole.agentOf', { name: sponsor.display_name })}</span>` : nothing}
          </div>
        </div>
        <sl-tooltip content="${t('agentConsole.closeEsc')}">
          <sl-icon-button class="close-btn" name="x-lg" @click=${this._close}></sl-icon-button>
        </sl-tooltip>
      </div>
    `;
  }

  private _renderMessages(myId: string | undefined) {
    if (this._loadingMessages) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    return html`
      <div class="messages-container">
        ${this._messages.length === 0
          ? html`
            <div class="message-empty">
              <sl-icon name="chat-left-dots"></sl-icon>
              <div>${t('agentConsole.messages.empty')}</div>
              <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7">
                ${t('agentConsole.messages.emptyHint')}
              </div>
            </div>
          `
          : html`
            <div class="messages-scroll">
              ${this._messages.map(m => {
                const isSent = m.sender_id === myId;
                return html`
                  <div class="message ${isSent ? 'sent' : 'received'}">
                    <div>${m.content}</div>
                    <div class="message-time">${timeAgo(m.created_at)}</div>
                  </div>
                `;
              })}
            </div>
          `}
        <div class="compose">
          <sl-textarea
            placeholder="${t('agentConsole.messages.placeholder', { name: this.participant?.display_name ?? 'agent' })}"
            rows="1"
            resize="auto"
            .value=${this._messageText}
            @sl-input=${(e: Event) => { this._messageText = (e.target as HTMLTextAreaElement).value; }}
            @keydown=${this._onComposeKeydown}
          ></sl-textarea>
          <sl-button
            variant="primary"
            size="small"
            ?loading=${this._sendingMessage}
            ?disabled=${!this._messageText.trim()}
            @click=${this._sendMessage}
          >
            <sl-icon name="send"></sl-icon>
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderActivity() {
    if (this._loadingActivity) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    if (this._activity.length === 0) {
      return html`
        <div class="activity-empty">
          <sl-icon name="clock-history"></sl-icon>
          <div>${t('agentConsole.activity.empty')}</div>
          <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7">
            ${t('agentConsole.activity.emptyHint')}
          </div>
        </div>
      `;
    }

    return html`
      <div class="activity-scroll">
        ${this._activity.map(e => {
          const icon = EVENT_ICONS[e.event_type] || 'circle';
          const color = EVENT_COLORS[e.event_type] || 'var(--text-tertiary)';
          return html`
            <div class="activity-event">
              <sl-icon class="activity-icon" name=${icon} style="color: ${color}"></sl-icon>
              <div class="activity-body">
                <div class="activity-summary">${e.summary}</div>
                <div class="activity-time">${timeAgo(e.created_at)}</div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }
  private _renderWorkspace() {
    if (this._loadingWorkspace) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    const agent = this._agentDetail?.agent;
    const ws = agent?.workspace;
    const task = agent?.current_task;

    if (!agent) {
      return html`
        <div class="ws-empty">
          <sl-icon name="hdd-stack"></sl-icon>
          <div>${t('agentConsole.workspace.empty')}</div>
          <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7">
            ${t('agentConsole.workspace.emptyHint')}
          </div>
        </div>
      `;
    }

    return html`
      <div class="workspace-scroll">
        ${ws ? html`
          <div class="ws-card">
            <div class="ws-card-label">${t('agentConsole.workspace.status')}</div>
            <div class="ws-status-row">
              <span class="ws-status-badge ${ws.status}">${ws.status}</span>
              ${ws.coder_workspace_name ? html`
                <span style="font-size: 0.75rem; color: var(--text-tertiary);">${ws.coder_workspace_name}</span>
              ` : nothing}
            </div>
          </div>

          ${ws.branch ? html`
            <div class="ws-card">
              <div class="ws-card-label">${t('agentConsole.workspace.branch')}</div>
              <div class="ws-card-value">
                <sl-icon name="git-branch" style="font-size: 0.8rem; vertical-align: middle; margin-right: 0.25rem;"></sl-icon>
                ${ws.branch}
              </div>
            </div>
          ` : nothing}

          ${ws.error_message ? html`
            <div class="ws-card" style="border-color: var(--sl-color-danger-500);">
              <div class="ws-card-label" style="color: var(--sl-color-danger-500);">${t('agentConsole.workspace.error')}</div>
              <div class="ws-card-value" style="color: var(--sl-color-danger-400); font-size: 0.8rem; white-space: pre-wrap;">
                ${ws.error_message}
              </div>
            </div>
          ` : nothing}

          ${ws.started_at ? html`
            <div class="ws-card">
              <div class="ws-card-label">${t('agentConsole.workspace.started')}</div>
              <div class="ws-card-value muted">${timeAgo(ws.started_at)}</div>
            </div>
          ` : nothing}
        ` : html`
          <div class="ws-card">
            <div class="ws-card-label">${t('agentConsole.workspace.label')}</div>
            <div class="ws-card-value muted">${t('agentConsole.workspace.noWorkspace')}</div>
          </div>
        `}

        ${task ? html`
          <div class="ws-card">
            <div class="ws-card-label">${t('agentConsole.workspace.currentTask')}</div>
            <div class="ws-task-card">
              <span class="ticket-id">${task.ticket_id}</span>
              <span class="title">${task.title}</span>
            </div>
            <sl-badge variant=${task.status === 'in_progress' ? 'primary' : task.status === 'done' ? 'success' : 'neutral'} style="margin-top: 0.35rem;">
              ${task.status}
            </sl-badge>
          </div>
        ` : nothing}

        ${agent.client_name || agent.model ? html`
          <div class="ws-card">
            <div class="ws-card-label">${t('agentConsole.workspace.agentInfo')}</div>
            ${agent.client_name ? html`<div style="font-size: 0.8rem; color: var(--text-secondary);">${agent.client_name}${agent.client_version ? ` v${agent.client_version}` : ''}</div>` : nothing}
            ${agent.model ? html`<div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.15rem;">${t('agentConsole.workspace.model', { model: agent.model })}</div>` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'agent-console': AgentConsole;
  }
}
