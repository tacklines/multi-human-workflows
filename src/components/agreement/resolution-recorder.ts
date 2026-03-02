import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ConflictResolution } from '../../schema/types.js';
import type { Overlap } from '../../lib/comparison.js';
import type { ResolutionSuggestion } from '../../lib/integration-heuristics.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/skeleton/skeleton.js';

import '../shared/empty-state.js';
import '../shared/domain-tooltip.js';

/**
 * Quick-resolve approach options with labels and icons.
 * These are the common patterns teams reach for in jam sessions.
 */
const QUICK_APPROACHES = [
  { value: 'merge', label: 'Merge', icon: 'intersect', description: 'Combine both perspectives into one' },
  { value: 'pick-left', label: 'Pick One', icon: 'hand-index-thumb', description: 'One role owns this; the other defers' },
  { value: 'split', label: 'Split', icon: 'scissors', description: 'These are actually two separate things' },
  { value: 'custom', label: 'Custom', icon: 'pencil-square', description: 'Describe a unique resolution' },
] as const;

type QuickApproach = (typeof QUICK_APPROACHES)[number]['value'];

/**
 * `<resolution-recorder>` — Inline conflict resolution UI.
 *
 * Given an overlap (conflict, shared event, or shared aggregate), this
 * component lets participants record how the team resolved it. It intentionally
 * feels like a quick inline action rather than a form — pick an approach, add
 * optional context, submit. Done.
 *
 * @fires resolution-recorded - Detail: { resolution: ConflictResolution }
 */
@customElement('resolution-recorder')
export class ResolutionRecorder extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Resolved state ── */
    .resolved-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 8px;
      font-size: 0.875rem;
      color: #15803d;
    }

    .resolved-banner sl-icon {
      flex-shrink: 0;
      font-size: 1rem;
    }

    .resolved-meta {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.125rem;
    }

    /* ── Approach picker ── */
    .approach-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }

    .approach-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.4rem 0.75rem;
      border-radius: 9999px;
      border: 2px solid #e5e7eb;
      background: #fff;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, color 0.15s;
      min-height: 44px;
      white-space: nowrap;
    }

    .approach-btn:hover {
      border-color: var(--sl-color-primary-400);
      color: var(--sl-color-primary-700);
    }

    .approach-btn:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 2px;
    }

    .approach-btn.selected {
      border-color: var(--sl-color-primary-500);
      background: var(--sl-color-primary-50);
      color: var(--sl-color-primary-700);
    }

    .approach-btn sl-icon {
      font-size: 0.9375rem;
    }

    /* ── Resolution detail area ── */
    .detail-area {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .detail-area sl-textarea {
      --sl-input-font-size-medium: 0.875rem;
    }

    /* ── Participants row ── */
    .participants-hint {
      font-size: 0.75rem;
      color: #6b7280;
      margin: 0;
    }

    .submit-row {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .error-text {
      font-size: 0.8125rem;
      color: var(--sl-color-danger-600);
    }

    /* ── Default slot hint (empty state) ── */
    .hint {
      font-size: 0.8125rem;
      color: #9ca3af;
      font-style: italic;
    }

    /* ── Suggestion banner ── */
    .suggestion-banner {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      background: #eff6ff;
      border-left: 3px solid var(--sl-color-primary-500, #3b82f6);
      border-radius: 6px;
      margin-bottom: 0.75rem;
    }

    .suggestion-banner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .suggestion-banner-title {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #1d4ed8;
    }

    .suggestion-banner-title sl-icon {
      font-size: 0.9375rem;
    }

    .suggestion-confidence {
      font-size: 0.75rem;
      color: #3b82f6;
      font-weight: 500;
    }

    .suggestion-reasoning {
      font-size: 0.8125rem;
      color: #374151;
      line-height: 1.4;
    }

    .suggestion-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    /* ── Suggestion loading skeleton ── */
    .suggestion-skeleton {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      background: #eff6ff;
      border-left: 3px solid var(--sl-color-primary-300, #93c5fd);
      border-radius: 6px;
      margin-bottom: 0.75rem;
    }

    .suggestion-skeleton sl-skeleton {
      --border-radius: 4px;
    }
  `;

  /** The overlap/conflict this recorder is attached to */
  @property({ attribute: false }) overlap!: Overlap;

  /** Session code — used when dispatching the recorded resolution */
  @property() sessionCode = '';

  /** The name of the person recording — used as resolvedBy entry */
  @property() participantName = '';

  /** API base URL for jam/resolve endpoint */
  @property() apiBase = 'http://localhost:3002';

  /** If already resolved, show the existing resolution instead of the picker */
  @property({ attribute: false }) existingResolution: ConflictResolution | null = null;

  /** AI-generated suggestion for this conflict, or null if none yet */
  @property({ attribute: false }) suggestion: ResolutionSuggestion | null = null;

  /** True while the suggestion is being computed — shows a loading skeleton */
  @property({ type: Boolean }) suggestionLoading = false;

  @state() private _selectedApproach: QuickApproach | null = null;
  @state() private _customText = '';
  @state() private _loading = false;
  @state() private _error = '';
  @state() private _suggestionDismissed = false;
  @state() private _suggestionRequested = false;

  render() {
    if (!this.overlap) {
      return html`
        <empty-state
          icon="people"
          heading="${t('emptyState.agreements.heading')}"
          description="${t('emptyState.agreements.description')}"
        ></empty-state>
      `;
    }
    if (this.existingResolution) {
      return this._renderResolved();
    }
    // Fire suggestion-requested once per overlap when no suggestion and not dismissed
    if (!this._suggestionRequested && !this.existingResolution && !this.suggestion && !this._suggestionDismissed) {
      this._suggestionRequested = true;
      // Schedule microtask so event fires after initial render settles
      Promise.resolve().then(() => {
        this.dispatchEvent(
          new CustomEvent('suggestion-requested', {
            detail: { overlapLabel: this.overlap.label },
            bubbles: true,
            composed: true,
          })
        );
      });
    }
    return this._renderRecorder();
  }

  private _renderResolved() {
    const r = this.existingResolution!;
    return html`
      <div class="resolved-banner" role="status" aria-label="${t('resolutionRecorder.resolvedAriaLabel')}">
        <sl-icon name="check-circle-fill" aria-hidden="true"></sl-icon>
        <div>
          <div>
            <domain-tooltip term="conflict"><strong>${r.chosenApproach}</strong></domain-tooltip>
            — ${r.resolution}
          </div>
          <div class="resolved-meta">
            ${t('resolutionRecorder.resolvedBy', { names: r.resolvedBy.join(', ') })}
          </div>
        </div>
      </div>
    `;
  }

  private _renderSuggestion() {
    if (this._suggestionDismissed) return nothing;

    // Loading skeleton
    if (this.suggestionLoading && !this.suggestion) {
      return html`
        <div class="suggestion-skeleton" role="status" aria-label="${t('resolutionRecorder.suggestion.loading')}">
          <sl-skeleton style="width: 40%; height: 1rem;"></sl-skeleton>
          <sl-skeleton style="width: 90%; height: 0.875rem;"></sl-skeleton>
          <sl-skeleton style="width: 70%; height: 0.875rem;"></sl-skeleton>
        </div>
      `;
    }

    if (!this.suggestion) return nothing;

    const confidenceText = t('resolutionRecorder.suggestion.confidence', {
      confidence: String(Math.round(this.suggestion.confidence * 100)),
    });

    return html`
      <div class="suggestion-banner" role="complementary" aria-label="${t('resolutionRecorder.suggestion.banner')}">
        <div class="suggestion-banner-header">
          <span class="suggestion-banner-title">
            <sl-icon name="stars" aria-hidden="true"></sl-icon>
            ${t('resolutionRecorder.suggestion.banner')}
          </span>
          <span class="suggestion-confidence">${confidenceText}</span>
        </div>
        <p class="suggestion-reasoning">${this.suggestion.reasoning}</p>
        <div class="suggestion-actions">
          <sl-button
            size="small"
            variant="primary"
            @click=${this._applySuggestion}
          >
            ${t('resolutionRecorder.suggestion.apply')}
          </sl-button>
          <sl-button
            size="small"
            variant="text"
            @click=${() => { this._suggestionDismissed = true; }}
            aria-label="${t('resolutionRecorder.suggestion.dismiss')}"
          >
            ${t('resolutionRecorder.suggestion.dismiss')}
          </sl-button>
        </div>
      </div>
    `;
  }

  private _applySuggestion() {
    if (!this.suggestion) return;
    const approach = this.suggestion.approach as QuickApproach;
    this._selectedApproach = approach;
    this._customText = this.suggestion.resolution;
    this._suggestionDismissed = true;
    this._error = '';
  }

  private _renderRecorder() {
    const needsText = this._selectedApproach === 'custom' || this._selectedApproach !== null;
    const canSubmit =
      this._selectedApproach !== null &&
      (this._selectedApproach !== 'custom' || this._customText.trim().length > 0);

    return html`
      <div role="group" aria-label="${t('resolutionRecorder.groupAriaLabel', { label: this.overlap?.label ?? 'conflict' })}">
        <!-- AI suggestion banner (renders above approach picker) -->
        ${this._renderSuggestion()}

        <!-- Quick-approach pill buttons -->
        <div class="approach-row" role="group" aria-label="${t('resolutionRecorder.approachGroupAriaLabel')}">
          ${QUICK_APPROACHES.map(
            (a) => {
              const approachLabel = t(`resolutionRecorder.approach.${a.value}`);
              const approachDesc = t(`resolutionRecorder.approach.${a.value}.description`);
              return html`
              <sl-tooltip content=${approachDesc}>
                <button
                  class="approach-btn ${this._selectedApproach === a.value ? 'selected' : ''}"
                  aria-pressed=${this._selectedApproach === a.value ? 'true' : 'false'}
                  aria-label="${approachLabel}: ${approachDesc}"
                  @click=${() => this._selectApproach(a.value)}
                >
                  <sl-icon name=${a.icon} aria-hidden="true"></sl-icon>
                  ${approachLabel}
                </button>
              </sl-tooltip>
            `;}
          )}
        </div>

        <!-- Detail text area — shown once an approach is chosen -->
        ${needsText
          ? html`
              <div class="detail-area">
                <sl-textarea
                  label=${this._selectedApproach === 'custom'
                    ? t('resolutionRecorder.describeLabel')
                    : t('resolutionRecorder.contextLabel')}
                  placeholder=${this._selectedApproach === 'custom'
                    ? 'e.g. We agreed that Order context owns this event, Payment context subscribes'
                    : 'Optional notes about how this was resolved…'}
                  rows="2"
                  resize="auto"
                  value=${this._customText}
                  @sl-input=${(e: CustomEvent) => {
                    this._customText = (e.target as HTMLTextAreaElement).value;
                  }}
                ></sl-textarea>

                <div class="submit-row">
                  <sl-button
                    variant="primary"
                    size="small"
                    ?loading=${this._loading}
                    ?disabled=${!canSubmit}
                    @click=${() => void this._submit()}
                  >
                    <sl-icon slot="prefix" name="check2-circle" aria-hidden="true"></sl-icon>
                    ${t('resolutionRecorder.submitButton')}
                  </sl-button>

                  <button
                    class="approach-btn"
                    aria-label="${t('resolutionRecorder.cancelAriaLabel')}"
                    @click=${this._cancel}
                    style="border-color: transparent; background: transparent; color: #6b7280;"
                  >
                    ${t('resolutionRecorder.cancelButton')}
                  </button>

                  ${this._error
                    ? html`<span class="error-text" role="alert">${this._error}</span>`
                    : nothing}
                </div>
              </div>
            `
          : html`
              <p class="hint">
                ${t('resolutionRecorder.hint')}
              </p>
            `}
      </div>
    `;
  }

  private _selectApproach(value: QuickApproach) {
    if (this._selectedApproach === value) {
      // Toggle off
      this._selectedApproach = null;
      this._customText = '';
    } else {
      this._selectedApproach = value;
      if (value !== 'custom') {
        // Pre-fill a sensible default text so the user can just click "Record"
        this._customText = t(`resolutionRecorder.approach.${value}.description`);
      } else {
        this._customText = '';
      }
    }
    this._error = '';
  }

  private _cancel() {
    this._selectedApproach = null;
    this._customText = '';
    this._error = '';
  }

  private async _submit() {
    if (!this._selectedApproach) return;

    const resolutionText =
      this._selectedApproach === 'custom'
        ? this._customText.trim()
        : this._customText.trim() ||
          t(`resolutionRecorder.approach.${this._selectedApproach}.description`);

    if (!resolutionText) {
      this._error = t('resolutionRecorder.error.descriptionRequired');
      return;
    }

    const resolvedBy = this.participantName ? [this.participantName] : ['Facilitator'];
    const payload = {
      overlapLabel: this.overlap.label,
      resolution: resolutionText,
      chosenApproach: this._selectedApproach,
      resolvedBy,
    };

    this._loading = true;
    this._error = '';

    try {
      if (this.sessionCode) {
        const res = await fetch(
          `${this.apiBase}/api/sessions/${this.sessionCode}/jam/resolve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `HTTP ${res.status}`);
        }
        const { resolution } = (await res.json()) as { resolution: ConflictResolution };
        this.dispatchEvent(
          new CustomEvent('resolution-recorded', {
            detail: { resolution },
            bubbles: true,
            composed: true,
          })
        );
      } else {
        // Offline / local mode — synthesize the resolution locally
        const resolution: ConflictResolution = {
          ...payload,
          resolvedAt: new Date().toISOString(),
        };
        this.dispatchEvent(
          new CustomEvent('resolution-recorded', {
            detail: { resolution },
            bubbles: true,
            composed: true,
          })
        );
      }
    } catch (err) {
      this._error = (err as Error).message;
    } finally {
      this._loading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'resolution-recorder': ResolutionRecorder;
  }
}
