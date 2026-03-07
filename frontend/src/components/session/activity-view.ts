import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchActivity, type ActivityEvent } from '../../state/task-api.js';
import { store, type SessionParticipant } from '../../state/app-state.js';
import { navigateTo } from '../../router.js';
import { t } from '../../lib/i18n.js';
import { relativeTime, formatTime } from '../../lib/date-utils.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';

const EVENT_ICONS: Record<string, string> = {
  task_created: 'plus-circle-fill',
  task_updated: 'pencil-fill',
  task_closed: 'check-circle-fill',
  task_deleted: 'trash-fill',
  comment_added: 'chat-left-text-fill',
  participant_joined: 'person-plus-fill',
  session_created: 'play-circle-fill',
};

const EVENT_COLORS: Record<string, string> = {
  task_created: 'var(--sl-color-success-500)',
  task_updated: 'var(--sl-color-primary-500)',
  task_closed: 'var(--sl-color-success-600)',
  task_deleted: 'var(--sl-color-danger-500)',
  comment_added: 'var(--sl-color-neutral-400)',
  participant_joined: 'var(--sl-color-teal-500)',
  session_created: 'var(--sl-color-purple-500)',
};

function getEventTypeLabel(type: string): string {
  const key = EVENT_TYPE_LABEL_KEYS[type];
  return key ? t(key) : type;
}

const EVENT_TYPE_LABEL_KEYS: Record<string, string> = {
  task_created: 'activityView.event.taskCreated',
  task_updated: 'activityView.event.taskUpdated',
  task_closed: 'activityView.event.taskClosed',
  task_deleted: 'activityView.event.taskDeleted',
  comment_added: 'activityView.event.comment',
  participant_joined: 'activityView.event.joined',
  session_created: 'activityView.event.sessionCreated',
};


@customElement('activity-view')
export class ActivityView extends LitElement {
  static styles = css`
    :host { display: block; flex: 1; padding: 1.5rem; overflow-y: auto; }

    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }

    .header h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }

    .filters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .filters sl-select {
      min-width: 140px;
    }

    .timeline {
      position: relative;
      padding-left: 1.5rem;
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 0.45rem;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--border-subtle);
    }

    .event {
      position: relative;
      padding: 0.65rem 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      transition: border-color 0.15s;
    }

    .event:hover {
      border-color: var(--border-medium);
    }

    .event-dot {
      position: absolute;
      left: -1.5rem;
      top: 0.85rem;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--surface-card);
      z-index: 1;
    }

    .event-top {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .event-top sl-icon {
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .event-actor {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    .event-type-badge {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      background: var(--surface-2);
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .event-time {
      margin-left: auto;
      font-size: 0.7rem;
      color: var(--text-tertiary);
      white-space: nowrap;
    }

    .event-summary {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .event-details {
      margin-top: 0.35rem;
      font-size: 0.75rem;
      color: var(--text-tertiary);
      font-family: var(--sl-font-mono);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem;
      color: var(--text-tertiary);
    }

    .empty-state sl-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 3rem;
    }

    .stats-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .stat-value {
      font-weight: 700;
      color: var(--text-secondary);
    }
  `;

  @property({ attribute: 'session-code' }) sessionCode = '';

  @property({ type: Array })
  participants: SessionParticipant[] = [];

  @state() private _events: ActivityEvent[] = [];
  @state() private _loading = true;
  @state() private _filterType = '';
  @state() private _filterActor = '';

  private _storeUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadActivity();
    this._storeUnsub = store.subscribe((event) => {
      if (event.type === 'activity-changed' || event.type === 'tasks-changed') {
        this._loadActivity();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._storeUnsub?.();
  }

  private async _loadActivity() {
    if (!this.sessionCode) return;
    this._loading = this._events.length === 0;
    try {
      const opts: { limit: number; actor_id?: string } = { limit: 100 };
      if (this._filterActor) opts.actor_id = this._filterActor;
      this._events = await fetchActivity(this.sessionCode, opts);
    } catch {
      // silent
    } finally {
      this._loading = false;
    }
  }

  private get _filteredEvents(): ActivityEvent[] {
    if (!this._filterType) return this._events;
    return this._events.filter(e => e.event_type === this._filterType);
  }

  private get _eventTypes(): string[] {
    const types = new Set(this._events.map(e => e.event_type));
    return [...types].sort();
  }

  render() {
    const events = this._filteredEvents;

    return html`
      <div class="header">
        <sl-icon-button name="arrow-left" @click=${() => navigateTo(`/sessions/${this.sessionCode}`)}></sl-icon-button>
        <h2>${t('activityView.title')}</h2>
        <sl-badge variant="neutral" pill>${this._events.length}</sl-badge>
      </div>

      <div class="filters">
        <sl-select
          placeholder="${t('activityView.filterAllTypes')}"
          size="small"
          clearable
          value=${this._filterType}
          @sl-change=${(e: Event) => { this._filterType = (e.target as HTMLSelectElement).value; }}
        >
          ${this._eventTypes.map(et => html`
            <sl-option value=${et}>
              <sl-icon slot="prefix" name=${EVENT_ICONS[et] || 'circle'} style="color: ${EVENT_COLORS[et] || 'inherit'}"></sl-icon>
              ${getEventTypeLabel(et)}
            </sl-option>
          `)}
        </sl-select>

        ${this.participants.length > 0 ? html`
          <sl-select
            placeholder="${t('activityView.filterAllParticipants')}"
            size="small"
            clearable
            value=${this._filterActor}
            @sl-change=${(e: Event) => {
              this._filterActor = (e.target as HTMLSelectElement).value;
              this._loadActivity();
            }}
          >
            ${this.participants.map(p => html`
              <sl-option value=${p.id}>
                <sl-icon slot="prefix" name=${p.participant_type === 'agent' ? 'robot' : 'person-fill'}></sl-icon>
                ${p.display_name}
              </sl-option>
            `)}
          </sl-select>
        ` : nothing}

        <sl-button size="small" variant="text" @click=${() => this._loadActivity()}>
          <sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>
          ${t('activityView.refresh')}
        </sl-button>
      </div>

      ${this._renderStats()}

      ${this._loading
        ? html`<div class="loading"><sl-spinner style="font-size: 2rem;"></sl-spinner></div>`
        : events.length === 0
          ? html`
            <div class="empty-state">
              <sl-icon name="clock-history"></sl-icon>
              <p>${this._filterType || this._filterActor ? t('activityView.emptyFiltered') : t('activityView.empty')}</p>
            </div>
          `
          : html`
            <div class="timeline">
              ${events.map(e => this._renderEvent(e))}
            </div>
          `}
    `;
  }

  private _renderStats() {
    if (this._events.length === 0) return nothing;
    const byType = new Map<string, number>();
    for (const e of this._events) {
      byType.set(e.event_type, (byType.get(e.event_type) || 0) + 1);
    }

    return html`
      <div class="stats-bar">
        ${[...byType.entries()].map(([type, count]) => html`
          <div class="stat">
            <sl-icon name=${EVENT_ICONS[type] || 'circle'} style="color: ${EVENT_COLORS[type] || 'inherit'}; font-size: 0.7rem;"></sl-icon>
            <span class="stat-value">${count}</span>
            ${getEventTypeLabel(type)}
          </div>
        `)}
      </div>
    `;
  }

  private _renderEvent(event: ActivityEvent) {
    const icon = EVENT_ICONS[event.event_type] || 'circle';
    const color = EVENT_COLORS[event.event_type] || 'var(--text-tertiary)';

    return html`
      <div class="event">
        <div class="event-dot" style="background: ${color}"></div>
        <div class="event-top">
          <sl-icon name=${icon} style="color: ${color}"></sl-icon>
          <span class="event-actor">${event.actor_name}</span>
          <span class="event-type-badge">${getEventTypeLabel(event.event_type)}</span>
          <span class="event-time" title=${formatTime(event.created_at)}>${relativeTime(event.created_at)}</span>
        </div>
        <div class="event-summary">${event.summary}</div>
        ${event.target_id ? html`
          <div class="event-details">${event.target_id}</div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'activity-view': ActivityView;
  }
}
