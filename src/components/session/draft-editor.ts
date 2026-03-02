import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { Draft } from '../../schema/types.js';
import type { SparkRow } from './spark-canvas.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';

/**
 * Draft Editor — inline editing with preview for draft artifacts.
 * Companion to the Spark Canvas; lets users refine events before publishing.
 *
 * When `readonly` is true, hides edit controls and shows a read-only view.
 *
 * @fires draft-publish — Fired when user publishes the draft.
 *   Detail: `{ id: string }`
 * @fires draft-discard — Fired when user discards the draft.
 *   Detail: `{ id: string }`
 * @fires draft-change — Fired when the draft content changes during editing.
 *   Detail: `{ id: string; rows: SparkRow[] }`
 */
@customElement('draft-editor')
export class DraftEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    /* ── Empty/null state ── */
    .empty-state {
      padding: 2rem;
      text-align: center;
      color: var(--sl-color-neutral-400);
      font-size: var(--sl-font-size-small);
    }

    /* ── Editor card ── */
    .editor-card {
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-large);
      background: var(--sl-color-neutral-0);
      overflow: hidden;
    }

    /* ── Header ── */
    .editor-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    .editor-title {
      margin: 0;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      flex: 1;
    }

    .draft-meta {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }

    /* ── Grid ── */
    .grid-wrapper {
      overflow-x: auto;
    }

    .grid {
      width: 100%;
      border-collapse: collapse;
    }

    .grid thead th {
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
      white-space: nowrap;
    }

    .grid tbody tr {
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .grid tbody tr:last-child {
      border-bottom: none;
    }

    .grid tbody tr:hover {
      background: var(--sl-color-neutral-50);
    }

    .grid tbody td {
      padding: 0;
    }

    .cell-input {
      width: 100%;
      min-width: 140px;
      padding: 0.5rem 0.75rem;
      border: none;
      background: transparent;
      font-size: var(--sl-font-size-small);
      font-family: var(--sl-font-sans);
      color: var(--sl-color-neutral-800);
      outline: none;
      box-sizing: border-box;
    }

    .cell-input:focus {
      background: var(--sl-color-primary-50);
      outline: 2px solid var(--sl-color-primary-400);
      outline-offset: -2px;
    }

    .cell-input[readonly] {
      cursor: default;
      color: var(--sl-color-neutral-700);
    }

    .cell-input[readonly]:focus {
      background: transparent;
      outline: none;
    }

    .cell-text {
      padding: 0.5rem 0.75rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-700);
      min-width: 140px;
    }

    .row-num {
      padding: 0.5rem 0.5rem 0.5rem 0.75rem;
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-400);
      text-align: center;
      width: 2rem;
      user-select: none;
    }

    .confidence-badge {
      padding: 0.25rem 0.5rem;
      font-size: var(--sl-font-size-x-small);
      text-transform: uppercase;
    }

    /* ── Footer ── */
    .editor-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--sl-color-neutral-200);
      background: var(--sl-color-neutral-50);
      flex-wrap: wrap;
    }

    .footer-meta {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
    }

    .footer-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    /* Published indicator */
    .published-notice {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-success-700);
    }
  `;

  /** The draft being edited. If null, renders an empty state. */
  @property({ attribute: false }) draft: Draft | null = null;

  /** When true, hides edit controls and shows a read-only view. */
  @property({ type: Boolean }) readonly = false;

  @state() private _editRows: SparkRow[] = [];

  override willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed);
    // Sync internal editable rows when the draft prop changes
    if (changed.has('draft') && this.draft) {
      this._editRows = this.draft.content.domain_events.map((ev) => ({
        eventName: ev.name,
        aggregate: ev.aggregate,
        trigger: ev.trigger,
      }));
    }
  }

  private _onCellInput(rowIdx: number, field: keyof SparkRow, e: Event) {
    if (this.readonly || !this.draft) return;
    const value = (e.target as HTMLInputElement).value;
    this._editRows = this._editRows.map((r, i) =>
      i === rowIdx ? { ...r, [field]: value } : r
    );
    this.dispatchEvent(
      new CustomEvent('draft-change', {
        detail: { id: this.draft.id, rows: this._editRows },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handlePublish() {
    if (!this.draft) return;
    this.dispatchEvent(
      new CustomEvent('draft-publish', {
        detail: { id: this.draft.id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleDiscard() {
    if (!this.draft) return;
    this.dispatchEvent(
      new CustomEvent('draft-discard', {
        detail: { id: this.draft.id },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    if (!this.draft) {
      return html`<div class="empty-state">${t('draft-editor.empty')}</div>`;
    }
    return this._renderEditor();
  }

  private _renderEditor() {
    const draft = this.draft!;
    const eventCount = this._editRows.length;
    const isPublished = !!draft.publishedAt;
    const updatedAt = new Date(draft.updatedAt).toLocaleString();

    return html`
      <div class="editor-card" role="region" aria-label="${t('draft-editor.title')}">
        <!-- Header -->
        <div class="editor-header">
          <h2 class="editor-title">
            ${t('draft-editor.title')}
            ${isPublished ? html`<sl-badge variant="success" style="margin-left:0.5rem;">Published</sl-badge>` : nothing}
          </h2>
          <span class="draft-meta">${t('draft-editor.updated-at', { time: updatedAt })}</span>
        </div>

        <!-- Grid of events -->
        <div class="grid-wrapper">
          <table
            class="grid"
            role="grid"
            aria-label="${t('draft-editor.title')}"
            aria-rowcount="${eventCount}"
            aria-readonly="${this.readonly}"
          >
            <thead>
              <tr role="row">
                <th scope="col" style="width:2rem" aria-hidden="true">#</th>
                <th scope="col">${t('draft-editor.col-event')}</th>
                <th scope="col">${t('draft-editor.col-aggregate')}</th>
                <th scope="col">${t('draft-editor.col-trigger')}</th>
              </tr>
            </thead>
            <tbody>
              ${this._editRows.map((row, idx) => this._renderRow(row, idx))}
              ${this._editRows.length === 0
                ? html`
                    <tr role="row">
                      <td colspan="4" style="padding:1rem;text-align:center;color:var(--sl-color-neutral-400);font-size:var(--sl-font-size-small);">
                        ${t('draft-editor.no-events')}
                      </td>
                    </tr>
                  `
                : nothing}
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="editor-footer">
          <span class="footer-meta">
            ${eventCount} event${eventCount !== 1 ? 's' : ''}
          </span>

          ${isPublished
            ? html`
                <div class="published-notice">
                  <sl-icon name="check-circle-fill" aria-hidden="true"></sl-icon>
                  Published ${new Date(draft.publishedAt!).toLocaleString()}
                </div>
              `
            : this.readonly
            ? nothing
            : html`
                <div class="footer-actions">
                  <sl-button
                    size="small"
                    variant="danger"
                    outline
                    aria-label="${t('draft-editor.discard-aria-label')}"
                    @click=${this._handleDiscard}
                  >
                    <sl-icon slot="prefix" name="trash" aria-hidden="true"></sl-icon>
                    ${t('draft-editor.discard')}
                  </sl-button>
                  <sl-button
                    size="small"
                    variant="primary"
                    aria-label="${t('draft-editor.publish-aria-label')}"
                    @click=${this._handlePublish}
                  >
                    <sl-icon slot="prefix" name="send" aria-hidden="true"></sl-icon>
                    ${t('draft-editor.publish')}
                  </sl-button>
                </div>
              `}
        </div>
      </div>
    `;
  }

  private _renderRow(row: SparkRow, idx: number) {
    if (this.readonly) {
      return html`
        <tr role="row" aria-rowindex="${idx + 1}">
          <td role="rowheader" class="row-num" aria-hidden="true">${idx + 1}</td>
          <td role="gridcell">
            <span class="cell-text">${row.eventName}</span>
          </td>
          <td role="gridcell">
            <span class="cell-text">${row.aggregate}</span>
          </td>
          <td role="gridcell">
            <span class="cell-text">${row.trigger}</span>
          </td>
        </tr>
      `;
    }

    return html`
      <tr role="row" aria-rowindex="${idx + 1}">
        <td role="rowheader" class="row-num" aria-hidden="true">${idx + 1}</td>
        <td role="gridcell">
          <input
            class="cell-input"
            type="text"
            .value=${row.eventName}
            placeholder="Event name"
            aria-label="${t('draft-editor.col-event')}, row ${idx + 1}"
            @input=${(e: Event) => this._onCellInput(idx, 'eventName', e)}
          />
        </td>
        <td role="gridcell">
          <input
            class="cell-input"
            type="text"
            .value=${row.aggregate}
            placeholder="Aggregate"
            aria-label="${t('draft-editor.col-aggregate')}, row ${idx + 1}"
            @input=${(e: Event) => this._onCellInput(idx, 'aggregate', e)}
          />
        </td>
        <td role="gridcell">
          <input
            class="cell-input"
            type="text"
            .value=${row.trigger}
            placeholder="Trigger"
            aria-label="${t('draft-editor.col-trigger')}, row ${idx + 1}"
            @input=${(e: Event) => this._onCellInput(idx, 'trigger', e)}
          />
        </td>
      </tr>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'draft-editor': DraftEditor;
  }
}
