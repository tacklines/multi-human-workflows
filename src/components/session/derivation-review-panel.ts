import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';

/** A single suggested event within a requirement group. */
export interface SuggestedEventItem {
  name: string;
  description: string;
  confidence: string;
  trigger: string;
  stateChange: string;
}

/** A group of suggested events derived from a single requirement. */
export interface SuggestionGroup {
  requirementId: string;
  requirementText: string;
  events: SuggestedEventItem[];
}

/** Detail payload for the events-accepted custom event. */
export interface EventsAcceptedDetail {
  selections: Array<{ requirementId: string; eventNames: string[] }>;
}

/** Detail payload for the event-edit-requested custom event. */
export interface EventEditRequestedDetail {
  requirementId: string;
  event: SuggestedEventItem;
}

/**
 * Derivation Review Panel — shows suggested domain events grouped by
 * source requirement, allowing users to accept, edit, or dismiss each.
 *
 * Shown during the Spark-to-Explore transition after requirements derivation.
 *
 * @fires events-accepted — Detail: EventsAcceptedDetail
 * @fires event-edit-requested — Detail: EventEditRequestedDetail
 */
@customElement('derivation-review-panel')
export class DerivationReviewPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .panel {
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: var(--sl-border-radius-large);
      background: var(--sl-color-neutral-0);
      overflow: hidden;
    }

    .panel-header {
      padding: 0.75rem 1rem;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    .panel-header h2 {
      margin: 0;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
    }

    .requirement-group {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .requirement-group:last-of-type {
      border-bottom: none;
    }

    .requirement-text {
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-700);
      margin: 0 0 0.5rem 0;
      font-style: italic;
    }

    .requirement-text::before {
      content: open-quote;
    }

    .requirement-text::after {
      content: close-quote;
    }

    .event-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-left: 0.75rem;
      border-left: 2px solid var(--sl-color-neutral-200);
    }

    .event-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      border-radius: var(--sl-border-radius-medium);
      transition: background 0.15s ease;
    }

    .event-row:hover {
      background: var(--sl-color-neutral-50);
    }

    .event-name {
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-800);
      flex: 1;
      min-width: 0;
    }

    .event-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .panel-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--sl-color-neutral-200);
      background: var(--sl-color-neutral-50);
    }

    .empty-state {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-small);
    }
  `;

  /** The derivation results grouped by requirement. */
  @property({ type: Array }) suggestions: SuggestionGroup[] = [];

  /** Track which events are selected (checked). Key: "reqId::eventName" */
  @state() private _selected: Set<string> = new Set();

  /** Track which events have been dismissed. Key: "reqId::eventName" */
  @state() private _dismissed: Set<string> = new Set();

  /** Whether initial selection has been applied for the current suggestions. */
  @state() private _initialized = false;

  override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('suggestions')) {
      this._initializeSelections();
    }
  }

  /** Select all events by default when suggestions change. */
  private _initializeSelections() {
    const selected = new Set<string>();
    for (const group of this.suggestions) {
      for (const event of group.events) {
        selected.add(this._key(group.requirementId, event.name));
      }
    }
    this._selected = selected;
    this._dismissed = new Set();
    this._initialized = true;
  }

  private _key(reqId: string, eventName: string): string {
    return `${reqId}::${eventName}`;
  }

  private _toggleEvent(reqId: string, eventName: string) {
    const key = this._key(reqId, eventName);
    const next = new Set(this._selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._selected = next;
  }

  private _dismissEvent(reqId: string, eventName: string) {
    const key = this._key(reqId, eventName);
    const nextDismissed = new Set(this._dismissed);
    nextDismissed.add(key);
    this._dismissed = nextDismissed;

    // Also remove from selection
    const nextSelected = new Set(this._selected);
    nextSelected.delete(key);
    this._selected = nextSelected;
  }

  private _requestEdit(reqId: string, event: SuggestedEventItem) {
    this.dispatchEvent(
      new CustomEvent<EventEditRequestedDetail>('event-edit-requested', {
        detail: { requirementId: reqId, event },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _getVisibleGroups(): Array<{ group: SuggestionGroup; visibleEvents: SuggestedEventItem[] }> {
    return this.suggestions
      .map((group) => ({
        group,
        visibleEvents: group.events.filter(
          (e) => !this._dismissed.has(this._key(group.requirementId, e.name))
        ),
      }))
      .filter(({ visibleEvents }) => visibleEvents.length > 0);
  }

  private _getSelectedEvents(): Array<{ requirementId: string; eventNames: string[] }> {
    const result: Array<{ requirementId: string; eventNames: string[] }> = [];
    for (const { group, visibleEvents } of this._getVisibleGroups()) {
      const eventNames = visibleEvents
        .filter((e) => this._selected.has(this._key(group.requirementId, e.name)))
        .map((e) => e.name);
      if (eventNames.length > 0) {
        result.push({ requirementId: group.requirementId, eventNames });
      }
    }
    return result;
  }

  private _acceptAll() {
    // Select all visible events first
    const next = new Set(this._selected);
    for (const { group, visibleEvents } of this._getVisibleGroups()) {
      for (const event of visibleEvents) {
        next.add(this._key(group.requirementId, event.name));
      }
    }
    this._selected = next;

    // Then fire acceptance
    const selections = this._getVisibleGroups().map(({ group, visibleEvents }) => ({
      requirementId: group.requirementId,
      eventNames: visibleEvents.map((e) => e.name),
    }));

    this.dispatchEvent(
      new CustomEvent<EventsAcceptedDetail>('events-accepted', {
        detail: { selections },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _acceptSelected() {
    const selections = this._getSelectedEvents();
    this.dispatchEvent(
      new CustomEvent<EventsAcceptedDetail>('events-accepted', {
        detail: { selections },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _confidenceBadgeVariant(confidence: string): 'success' | 'primary' | 'warning' {
    switch (confidence.toUpperCase()) {
      case 'CONFIRMED':
        return 'success';
      case 'LIKELY':
        return 'primary';
      default:
        return 'warning';
    }
  }

  private _confidenceLabel(confidence: string): string {
    switch (confidence.toUpperCase()) {
      case 'CONFIRMED':
        return t('derivationReview.confidence.confirmed');
      case 'LIKELY':
        return t('derivationReview.confidence.likely');
      default:
        return t('derivationReview.confidence.possible');
    }
  }

  override render() {
    const visibleGroups = this._getVisibleGroups();

    if (this.suggestions.length === 0) {
      return nothing;
    }

    const selectedCount = this._getSelectedEvents().reduce(
      (sum, g) => sum + g.eventNames.length,
      0
    );

    return html`
      <div class="panel" role="region" aria-label="${t('derivationReview.heading')}">
        <div class="panel-header">
          <h2>${t('derivationReview.heading')}</h2>
        </div>

        ${visibleGroups.length === 0
          ? html`<div class="empty-state">${t('derivationReview.allDismissed')}</div>`
          : visibleGroups.map(({ group, visibleEvents }) => this._renderGroup(group, visibleEvents))}

        <div class="panel-footer">
          <sl-button
            variant="primary"
            @click=${this._acceptAll}
            aria-label="${t('derivationReview.acceptAll')}"
            ?disabled=${visibleGroups.length === 0}
          >
            ${t('derivationReview.acceptAll')}
          </sl-button>
          <sl-button
            variant="default"
            @click=${this._acceptSelected}
            aria-label="${t('derivationReview.acceptSelected')}"
            ?disabled=${selectedCount === 0}
          >
            ${t('derivationReview.acceptSelected')}
          </sl-button>
        </div>
      </div>
    `;
  }

  private _renderGroup(group: SuggestionGroup, visibleEvents: SuggestedEventItem[]) {
    return html`
      <div class="requirement-group">
        <p class="requirement-text">${group.requirementText}</p>
        <div class="event-list" role="list" aria-label="${t('derivationReview.eventListLabel', { requirement: group.requirementText })}">
          ${visibleEvents.map((event) => this._renderEventRow(group.requirementId, event))}
        </div>
      </div>
    `;
  }

  private _renderEventRow(reqId: string, event: SuggestedEventItem) {
    const key = this._key(reqId, event.name);
    const isSelected = this._selected.has(key);

    return html`
      <div class="event-row" role="listitem">
        <sl-checkbox
          ?checked=${isSelected}
          aria-label="${event.name}: ${event.description}"
          @sl-change=${() => this._toggleEvent(reqId, event.name)}
        >
          <span class="event-name">${event.name}</span>
        </sl-checkbox>
        <sl-badge
          variant="${this._confidenceBadgeVariant(event.confidence)}"
          pill
        >${this._confidenceLabel(event.confidence)}</sl-badge>
        <div class="event-actions">
          <sl-icon-button
            name="pencil"
            label="${t('derivationReview.editLabel', { name: event.name })}"
            @click=${() => this._requestEdit(reqId, event)}
          ></sl-icon-button>
          <sl-icon-button
            name="x-lg"
            label="${t('derivationReview.dismissLabel', { name: event.name })}"
            @click=${() => this._dismissEvent(reqId, event.name)}
          ></sl-icon-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'derivation-review-panel': DerivationReviewPanel;
  }
}
