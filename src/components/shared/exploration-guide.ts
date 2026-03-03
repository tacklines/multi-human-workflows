import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';
import { when } from 'lit/directives/when.js';
import type { EventPriority } from '../../schema/types.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';

/** Shape of a single event entry passed in from the parent */
export interface ExploreEvent {
  name: string;
  aggregate: string;
  participantId: string;
  participantName: string;
}

/** Shape of a next-step action item computed by the component */
interface NextStep {
  label: string;
  phase: string;
}

/**
 * `<exploration-guide>` — Contextual sidebar guide for Phase II (Explore).
 *
 * Shows event relationships, exploration prompts, and suggested next actions
 * based on current session state. Purely presentational — emits events for
 * the parent to handle; no fetch calls, no store imports.
 *
 * @fires exploration-event-selected - User clicked a related event.
 *   Detail: `{ eventName: string }`
 * @fires exploration-phase-nav - User clicked a "Go to X phase" next step.
 *   Detail: `{ phase: string }`
 */
@customElement('exploration-guide')
export class ExplorationGuide extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .guide {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    /* Section containers */
    .section {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--sl-color-neutral-100, #f3f4f6);
    }

    .section:last-child {
      border-bottom: none;
    }

    /* Section headings */
    .section-heading {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: var(--sl-font-size-x-small, 0.75rem);
      font-weight: var(--sl-font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sl-color-neutral-500, #6b7280);
      margin: 0 0 0.625rem 0;
    }

    .section-heading sl-icon {
      font-size: 0.875rem;
      flex-shrink: 0;
    }

    /* Selected event detail */
    .event-name {
      font-weight: var(--sl-font-weight-semibold, 600);
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-900, #111827);
      font-family: var(--sl-font-mono, monospace);
      margin: 0 0 0.375rem 0;
      word-break: break-all;
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: var(--sl-font-size-x-small, 0.75rem);
      color: var(--sl-color-neutral-500, #6b7280);
      margin-bottom: 0.25rem;
      flex-wrap: wrap;
    }

    .meta-label {
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-600, #4b5563);
    }

    .participant-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1rem 0.4rem;
      border-radius: var(--sl-border-radius-pill, 9999px);
      background: var(--sl-color-primary-50, #eff6ff);
      color: var(--sl-color-primary-700, #1d4ed8);
      font-size: var(--sl-font-size-x-small, 0.75rem);
      font-weight: var(--sl-font-weight-medium, 500);
    }

    .overlap-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.15rem 0.45rem;
      border-radius: var(--sl-border-radius-pill, 9999px);
      background: var(--sl-color-warning-50, #fffbeb);
      border: 1px solid var(--sl-color-warning-200, #fde68a);
      color: var(--sl-color-warning-700, #b45309);
      font-size: var(--sl-font-size-x-small, 0.75rem);
      font-weight: var(--sl-font-weight-semibold, 600);
    }

    /* Related events list */
    .related-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .related-event-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 4px);
      background: var(--sl-color-neutral-0, #ffffff);
      cursor: pointer;
      text-align: left;
      font-size: var(--sl-font-size-x-small, 0.75rem);
      font-family: var(--sl-font-mono, monospace);
      color: var(--sl-color-neutral-700, #374151);
      transition: background 0.15s ease, border-color 0.15s ease;
      min-height: 2.25rem; /* ~36px, accessible touch target */
    }

    .related-event-btn:hover,
    .related-event-btn:focus-visible {
      background: var(--sl-color-primary-50, #eff6ff);
      border-color: var(--sl-color-primary-200, #bfdbfe);
      color: var(--sl-color-primary-700, #1d4ed8);
      outline: none;
    }

    .related-event-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500, #3b82f6);
      outline-offset: 1px;
    }

    .related-event-btn sl-icon {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      flex-shrink: 0;
    }

    /* Exploration prompts */
    .prompt-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .prompt {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.5rem 0.625rem;
      border-radius: var(--sl-border-radius-medium, 4px);
      background: var(--sl-color-neutral-50, #f9fafb);
      border-left: 3px solid var(--sl-color-primary-300, #93c5fd);
      font-size: var(--sl-font-size-x-small, 0.75rem);
      color: var(--sl-color-neutral-700, #374151);
      line-height: 1.5;
    }

    .prompt sl-icon {
      font-size: 0.75rem;
      color: var(--sl-color-primary-400, #60a5fa);
      margin-top: 0.1rem;
      flex-shrink: 0;
    }

    /* Next steps */
    .next-step-list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .next-step-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.625rem;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 4px);
      background: var(--sl-color-neutral-0, #ffffff);
      cursor: pointer;
      text-align: left;
      font-size: var(--sl-font-size-x-small, 0.75rem);
      color: var(--sl-color-neutral-700, #374151);
      transition: background 0.15s ease, border-color 0.15s ease;
      min-height: 2.25rem;
    }

    .next-step-btn:hover,
    .next-step-btn:focus-visible {
      background: var(--sl-color-success-50, #f0fdf4);
      border-color: var(--sl-color-success-200, #bbf7d0);
      color: var(--sl-color-success-700, #15803d);
      outline: none;
    }

    .next-step-btn:focus-visible {
      outline: 2px solid var(--sl-color-success-500, #22c55e);
      outline-offset: 1px;
    }

    .next-step-btn sl-icon {
      font-size: 0.75rem;
      color: var(--sl-color-success-500, #22c55e);
      flex-shrink: 0;
    }

    /* Empty / placeholder states */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.375rem;
      padding: 0.75rem 0.5rem;
      color: var(--sl-color-neutral-400, #9ca3af);
      font-size: var(--sl-font-size-x-small, 0.75rem);
      text-align: center;
    }

    .empty-state sl-icon {
      font-size: 1.125rem;
    }

    .aggregate-tag {
      display: inline-flex;
      align-items: center;
      padding: 0.1rem 0.4rem;
      border-radius: var(--sl-border-radius-small, 2px);
      background: var(--sl-color-neutral-100, #f3f4f6);
      color: var(--sl-color-neutral-600, #4b5563);
      font-size: var(--sl-font-size-x-small, 0.75rem);
      font-family: var(--sl-font-mono, monospace);
    }
  `;

  /** Current session code */
  @property({ type: String }) sessionCode = '';

  /** Currently selected event name, or null when none is selected */
  @property({ attribute: false }) selectedEventName: string | null = null;

  /** All events across all participants */
  @property({ attribute: false }) events: ExploreEvent[] = [];

  /** Session participants */
  @property({ attribute: false }) participants: Array<{ id: string; name: string }> = [];

  /** Set priorities — used to show gaps */
  @property({ attribute: false }) priorities: EventPriority[] = [];

  /** Current UX phase — used to tailor suggestions */
  @property({ type: String }) phase = 'explore';

  // ---------------------------------------------------------------------------
  // Computed helpers
  // ---------------------------------------------------------------------------

  private get _selectedEvent(): ExploreEvent | undefined {
    if (!this.selectedEventName) return undefined;
    return this.events.find((e) => e.name === this.selectedEventName);
  }

  /** All participants that have submitted an event with the selected name */
  private get _selectedEventParticipants(): Array<{ id: string; name: string }> {
    if (!this.selectedEventName) return [];
    const seen = new Map<string, string>();
    for (const ev of this.events) {
      if (ev.name === this.selectedEventName) {
        seen.set(ev.participantId, ev.participantName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }

  /** Events in the same aggregate as the selected event, excluding the selected one itself */
  private get _relatedEvents(): ExploreEvent[] {
    const selected = this._selectedEvent;
    if (!selected) return [];
    const aggregate = selected.aggregate;
    const seen = new Set<string>();
    const result: ExploreEvent[] = [];
    for (const ev of this.events) {
      if (ev.aggregate === aggregate && ev.name !== this.selectedEventName && !seen.has(ev.name)) {
        seen.add(ev.name);
        result.push(ev);
      }
    }
    return result;
  }

  /** Number of distinct event names that appear in more than one participant's submission */
  private get _duplicateEventCount(): number {
    const counts = new Map<string, Set<string>>();
    for (const ev of this.events) {
      if (!counts.has(ev.name)) counts.set(ev.name, new Set());
      counts.get(ev.name)!.add(ev.participantId);
    }
    let dups = 0;
    for (const participants of counts.values()) {
      if (participants.size > 1) dups++;
    }
    return dups;
  }

  /** Unique event names across all participants */
  private get _uniqueEventNames(): string[] {
    const seen = new Set<string>();
    for (const ev of this.events) seen.add(ev.name);
    return Array.from(seen);
  }

  /** Number of unique events that do not yet have a priority from any participant */
  private get _unprioritizedEventCount(): number {
    const prioritized = new Set(this.priorities.map((p) => p.eventName));
    return this._uniqueEventNames.filter((name) => !prioritized.has(name)).length;
  }

  get explorationPrompts(): string[] {
    const selectedParticipants = this._selectedEventParticipants;

    if (!this.selectedEventName) {
      return [
        'What are the most important things that happen in your domain?',
        'Which aggregates are central to your team\'s responsibilities?',
        'What external systems do your events depend on?',
      ];
    }

    if (selectedParticipants.length >= 2) {
      return [
        `Do both teams mean the same thing by "${this.selectedEventName}"?`,
        'Are the payload fields identical, or do they carry different data?',
        'Who is the authoritative owner of this event?',
      ];
    }

    return [
      `Who triggers "${this.selectedEventName}"? A user action, a system job, or another event?`,
      `What happens if "${this.selectedEventName}" fails or is retried?`,
      `Which other aggregates need to know when "${this.selectedEventName}" occurs?`,
    ];
  }

  get nextSteps(): NextStep[] {
    const steps: NextStep[] = [];

    // Only show priority gap nudge once we're at rank phase or beyond
    const phaseOrder = ['spark', 'explore', 'rank', 'slice', 'agree', 'build', 'ship'];
    const phaseIndex = phaseOrder.indexOf(this.phase);
    const rankIndex = phaseOrder.indexOf('rank');

    if (phaseIndex >= rankIndex && this._unprioritizedEventCount > 0) {
      steps.push({
        label: `Set priorities for ${this._unprioritizedEventCount} event${this._unprioritizedEventCount !== 1 ? 's' : ''}`,
        phase: 'rank',
      });
    }

    if (this._duplicateEventCount > 0) {
      steps.push({
        label: `Resolve ${this._duplicateEventCount} potential overlap${this._duplicateEventCount !== 1 ? 's' : ''}`,
        phase: 'rank',
      });
    }

    if (this.phase === 'explore' && this.events.length > 0) {
      steps.push({
        label: 'Ready to rank? Move to the Rank phase',
        phase: 'rank',
      });
    }

    return steps.slice(0, 3);
  }

  // ---------------------------------------------------------------------------
  // Event dispatchers
  // ---------------------------------------------------------------------------

  private _selectEvent(eventName: string) {
    this.dispatchEvent(
      new CustomEvent('exploration-event-selected', {
        detail: { eventName },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _navToPhase(phase: string) {
    this.dispatchEvent(
      new CustomEvent('exploration-phase-nav', {
        detail: { phase },
        bubbles: true,
        composed: true,
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  private _renderSelectedEvent() {
    const selected = this._selectedEvent;
    if (!selected) return nothing;

    const participantsWithEvent = this._selectedEventParticipants;
    const isOverlap = participantsWithEvent.length > 1;

    return html`
      <section class="section" aria-label="Selected event details">
        <h3 class="section-heading">
          <sl-icon name="cursor-text" aria-hidden="true"></sl-icon>
          Selected Event
        </h3>
        <p class="event-name">${selected.name}</p>
        <div class="meta-row">
          <span class="meta-label">Aggregate:</span>
          <span class="aggregate-tag">${selected.aggregate}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">In:</span>
          ${map(
            participantsWithEvent,
            (p) => html`<span class="participant-chip">${p.name}</span>`
          )}
          ${when(
            isOverlap,
            () => html`
              <span class="overlap-badge" role="status">
                <sl-icon name="exclamation-triangle" aria-hidden="true"></sl-icon>
                overlap
              </span>
            `
          )}
        </div>
      </section>
    `;
  }

  private _renderRelatedEvents() {
    if (!this.selectedEventName) return nothing;

    const related = this._relatedEvents;

    return html`
      <section class="section" aria-label="Related events in same aggregate">
        <h3 class="section-heading">
          <sl-icon name="diagram-3" aria-hidden="true"></sl-icon>
          Related Events
        </h3>
        ${when(
          related.length > 0,
          () => html`
            <ul class="related-list" role="list" aria-label="Events in same aggregate">
              ${map(
                related,
                (ev) => html`
                  <li role="listitem">
                    <button
                      class="related-event-btn"
                      type="button"
                      aria-label="Select event ${ev.name}"
                      @click=${() => this._selectEvent(ev.name)}
                    >
                      <sl-icon name="arrow-right-short" aria-hidden="true"></sl-icon>
                      ${ev.name}
                    </button>
                  </li>
                `
              )}
            </ul>
          `,
          () => html`
            <div class="empty-state">
              <sl-icon name="inbox" aria-hidden="true"></sl-icon>
              <span>No other events in this aggregate</span>
            </div>
          `
        )}
      </section>
    `;
  }

  private _renderPrompts() {
    const prompts = this.explorationPrompts;

    return html`
      <section class="section" aria-label="Exploration prompts">
        <h3 class="section-heading">
          <sl-icon name="chat-square-text" aria-hidden="true"></sl-icon>
          Exploration Prompts
        </h3>
        <ul class="prompt-list" role="list" aria-label="Questions to consider">
          ${map(
            prompts,
            (prompt) => html`
              <li class="prompt" role="listitem">
                <sl-icon name="question-circle" aria-hidden="true"></sl-icon>
                <span>${prompt}</span>
              </li>
            `
          )}
        </ul>
      </section>
    `;
  }

  private _renderNextSteps() {
    const steps = this.nextSteps;

    return html`
      <section class="section" aria-label="Suggested next steps">
        <h3 class="section-heading">
          <sl-icon name="arrow-right-circle" aria-hidden="true"></sl-icon>
          Next Steps
        </h3>
        ${when(
          steps.length > 0,
          () => html`
            <ul class="next-step-list" role="list" aria-label="Action items">
              ${map(
                steps,
                (step) => html`
                  <li role="listitem">
                    <button
                      class="next-step-btn"
                      type="button"
                      aria-label="${step.label}"
                      @click=${() => this._navToPhase(step.phase)}
                    >
                      <sl-icon name="check2-circle" aria-hidden="true"></sl-icon>
                      ${step.label}
                    </button>
                  </li>
                `
              )}
            </ul>
          `,
          () => html`
            <div class="empty-state">
              <sl-icon name="check-all" aria-hidden="true"></sl-icon>
              <span>You're all caught up. Keep exploring!</span>
            </div>
          `
        )}
      </section>
    `;
  }

  override render() {
    return html`
      <div class="guide" role="complementary" aria-label="Exploration guide">
        ${this._renderSelectedEvent()}
        ${this._renderRelatedEvents()}
        ${this._renderPrompts()}
        ${this._renderNextSteps()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exploration-guide': ExplorationGuide;
  }
}
