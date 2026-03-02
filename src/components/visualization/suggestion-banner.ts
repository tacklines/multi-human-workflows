import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';

/**
 * Suggestion Banner — displays an agent-generated suggestion at the top of
 * the Priority View. Shows suggestion text with Accept / Dismiss controls.
 *
 * - Subtle indigo background with a sparkle icon to signal agent origin
 * - Accept button emits `suggestion-accepted` with `{ id, text }` detail
 * - Dismiss button emits `suggestion-dismissed` with `{ id }` detail
 * - Accessible: `role="status"` + `aria-live="polite"` so screen readers
 *   announce new suggestions without interrupting the user
 *
 * @fires suggestion-accepted - User clicked Accept.
 *   Detail: `{ id: string; text: string }`
 * @fires suggestion-dismissed - User clicked Dismiss.
 *   Detail: `{ id: string }`
 */
@customElement('suggestion-banner')
export class SuggestionBanner extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .banner {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.625rem 1rem;
      background: var(--sl-color-violet-50, #f5f3ff);
      border: 1px solid var(--sl-color-violet-200, #ddd6fe);
      border-radius: var(--sl-border-radius-medium, 6px);
      margin-bottom: 0.75rem;
    }

    .icon {
      flex-shrink: 0;
      width: 1.125rem;
      height: 1.125rem;
      margin-top: 0.125rem;
      color: var(--sl-color-violet-600, #7c3aed);
    }

    .body {
      flex: 1;
      min-width: 0;
    }

    .label {
      font-size: 0.6875rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--sl-color-violet-600, #7c3aed);
      margin-bottom: 0.125rem;
    }

    .text {
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-neutral-700, #374151);
      line-height: 1.5;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    /* Override Shoelace button sizing to keep the banner compact */
    sl-button::part(base) {
      font-size: 0.8125rem;
      height: auto;
      padding: 0.25rem 0.75rem;
    }
  `;

  /** The suggestion text to display. */
  @property({ type: String }) text = '';

  /** Unique identifier for the suggestion (used in event detail). */
  @property({ type: String }) suggestionId = '';

  private _handleAccept() {
    this.dispatchEvent(
      new CustomEvent('suggestion-accepted', {
        bubbles: true,
        composed: true,
        detail: { id: this.suggestionId, text: this.text },
      })
    );
  }

  private _handleDismiss() {
    this.dispatchEvent(
      new CustomEvent('suggestion-dismissed', {
        bubbles: true,
        composed: true,
        detail: { id: this.suggestionId },
      })
    );
  }

  override render() {
    if (!this.text) return nothing;

    return html`
      <div
        class="banner"
        role="status"
        aria-live="polite"
        aria-label="${t('suggestionBanner.agentLabel')}"
      >
        <!-- Sparkle / agent icon -->
        <svg class="icon" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <path d="M9 1l1.545 4.755L15.3 7.5l-4.755 1.545L9 13.8l-1.545-4.755L2.7 7.5l4.755-1.545L9 1z"/>
          <circle cx="14.5" cy="3.5" r="1" opacity="0.6"/>
          <circle cx="4" cy="14" r="0.75" opacity="0.6"/>
        </svg>

        <div class="body">
          <div class="label">${t('suggestionBanner.agentLabel')}</div>
          <p class="text">${this.text}</p>
        </div>

        <div class="actions">
          <sl-button
            size="small"
            variant="primary"
            aria-label="${t('suggestionBanner.acceptAriaLabel')}"
            @click=${this._handleAccept}
          >${t('suggestionBanner.accept')}</sl-button>

          <sl-button
            size="small"
            variant="text"
            aria-label="${t('suggestionBanner.dismissAriaLabel')}"
            @click=${this._handleDismiss}
          >${t('suggestionBanner.dismiss')}</sl-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'suggestion-banner': SuggestionBanner;
  }
}
