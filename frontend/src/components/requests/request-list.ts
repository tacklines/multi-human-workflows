import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchRequests, createRequest, type RequestListView, type RequestStatusType } from '../../state/requirement-api.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

const STATUS_VARIANTS: Record<RequestStatusType, string> = {
  pending: 'neutral',
  analyzing: 'warning',
  decomposed: 'success',
  archived: 'neutral',
};

const STATUS_LABEL_KEYS: Record<RequestStatusType, string> = {
  pending: 'requestList.status.pending',
  analyzing: 'requestList.status.analyzing',
  decomposed: 'requestList.status.decomposed',
  archived: 'requestList.status.archived',
};

@customElement('request-list')
export class RequestList extends LitElement {
  static styles = css`
    :host { display: block; }

    .request-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .request-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1rem;
      background: var(--surface-card);
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.15s;
    }

    .request-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .request-row:hover {
      background: var(--surface-active, rgba(255,255,255,0.04));
    }

    .request-title {
      flex: 1;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }

    .request-title.archived {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .request-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
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

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  @property() projectId = '';

  @state() private _requests: RequestListView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _showNew = false;
  @state() private _newTitle = '';
  @state() private _newBody = '';
  @state() private _creating = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('projectId') && this.projectId) {
      this._load();
    }
  }

  private async _load() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = '';
    try {
      this._requests = await fetchRequests(this.projectId);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('requestList.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private async _create() {
    if (!this._newTitle.trim() || !this._newBody.trim()) return;
    this._creating = true;
    try {
      const req = await createRequest(this.projectId, {
        title: this._newTitle.trim(),
        body: this._newBody.trim(),
      });
      this._newTitle = '';
      this._newBody = '';
      this._showNew = false;
      this._requests = [req, ...this._requests];
      this.dispatchEvent(new CustomEvent('request-select', { detail: { requestId: req.id }, bubbles: true, composed: true }));
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('requestList.errorCreate');
    } finally {
      this._creating = false;
    }
  }

  private _relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('time.justNow');
    if (mins < 60) return t('time.minutesAgo', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('time.hoursAgo', { count: hrs });
    const days = Math.floor(hrs / 24);
    return t('time.daysAgo', { count: days });
  }

  private _selectRequest(id: string) {
    this.dispatchEvent(new CustomEvent('request-select', { detail: { requestId: id }, bubbles: true, composed: true }));
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    return html`
      ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 0.75rem;">${this._error}</sl-alert>` : nothing}

      ${this._requests.length === 0 ? html`
        <div class="empty-state">
          <sl-icon name="chat-square-text"></sl-icon>
          ${t('requestList.empty')}
          <div style="margin-top: 0.5rem;">
            <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${t('requestList.newRequest')}
            </sl-button>
          </div>
        </div>
      ` : html`
        <div style="margin-bottom: 0.75rem; text-align: right;">
          <sl-button size="small" variant="primary" @click=${() => { this._showNew = true; }}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${t('requestList.newRequest')}
          </sl-button>
        </div>
        <div class="request-list">
          ${this._requests.map(r => html`
            <div class="request-row" role="button" tabindex="0"
                 @click=${() => this._selectRequest(r.id)}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._selectRequest(r.id); }}>
              <sl-icon name="chat-square-text" style="color: var(--text-tertiary); font-size: 0.9rem;"></sl-icon>
              <span class="request-title ${r.status === 'archived' ? 'archived' : ''}">${r.title}</span>
              <sl-badge variant=${STATUS_VARIANTS[r.status]}>${t(STATUS_LABEL_KEYS[r.status])}</sl-badge>
              ${r.requirement_count > 0 ? html`
                <span class="request-meta">${t('requestList.requirements', { count: r.requirement_count, suffix: r.requirement_count !== 1 ? 's' : '' })}</span>
              ` : nothing}
              <sl-tooltip content=${t('requestList.updated', { time: this._relativeTime(r.updated_at) })}>
                <span class="request-meta">${this._relativeTime(r.updated_at)}</span>
              </sl-tooltip>
            </div>
          `)}
        </div>
      `}

      <sl-dialog label=${t('requestList.dialogLabel')} ?open=${this._showNew}
                 @sl-after-hide=${() => { this._showNew = false; }}>
        <div class="dialog-form">
          <sl-input label=${t('requestList.titleLabel')} placeholder=${t('requestList.titlePlaceholder')}
                    value=${this._newTitle}
                    @sl-input=${(e: CustomEvent) => { this._newTitle = (e.target as HTMLInputElement).value; }}
          ></sl-input>
          <sl-textarea label=${t('requestList.bodyLabel')} placeholder=${t('requestList.bodyPlaceholder')}
                       rows="4" value=${this._newBody}
                       @sl-input=${(e: CustomEvent) => { this._newBody = (e.target as HTMLTextAreaElement).value; }}
          ></sl-textarea>
        </div>
        <sl-button slot="footer" variant="primary" ?loading=${this._creating}
                   @click=${() => void this._create()}>
          ${t('requestList.create')}
        </sl-button>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'request-list': RequestList;
  }
}
