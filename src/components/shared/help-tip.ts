import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HelpTipKey } from '../../lib/first-run.js';
import { hasSeenTip, markTipSeen } from '../../lib/first-run.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';

/**
 * Contextual first-time help overlay that wraps any content.
 *
 * When `active` is true and the tip has not been seen by this user, a floating
 * help card appears pointing at the slotted content. The card auto-dismisses
 * after `duration` milliseconds and can also be dismissed manually via the
 * "Got it" button, the Escape key, or a click outside the card.
 *
 * The tip is tracked per-browser in localStorage via `src/lib/first-run.ts`.
 * Once dismissed, the card will never appear again for this user.
 *
 * @fires tip-dismissed - Fired when the tip is dismissed (by any means).
 *   `detail: { tipKey: HelpTipKey }`
 *
 * @example
 * ```html
 * <help-tip tip-key="comparison-view" message="..." ?active=${true}>
 *   <comparison-view></comparison-view>
 * </help-tip>
 * ```
 */
@customElement('help-tip')
export class HelpTip extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .wrapper {
      position: relative;
      display: contents;
    }

    /* Anchor for absolute-positioned card */
    .anchor {
      position: relative;
    }

    .card {
      position: absolute;
      z-index: 100;
      min-width: 16rem;
      max-width: 22rem;
      background: var(--sl-color-neutral-0, #fff);
      border: 1px solid var(--sl-color-primary-200, #bfdbfe);
      border-radius: 0.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(59, 130, 246, 0.08);
      padding: 0.875rem 1rem 0.75rem;
    }

    /* Position variants */
    .card.top {
      bottom: calc(100% + 0.625rem);
      left: 50%;
      transform: translateX(-50%);
    }

    .card.bottom {
      top: calc(100% + 0.625rem);
      left: 50%;
      transform: translateX(-50%);
    }

    .card.left {
      right: calc(100% + 0.625rem);
      top: 50%;
      transform: translateY(-50%);
    }

    .card.right {
      left: calc(100% + 0.625rem);
      top: 50%;
      transform: translateY(-50%);
    }

    /* Arrow */
    .card::before {
      content: '';
      position: absolute;
      width: 0.625rem;
      height: 0.625rem;
      background: var(--sl-color-neutral-0, #fff);
      border: 1px solid var(--sl-color-primary-200, #bfdbfe);
      transform: rotate(45deg);
    }

    .card.top::before {
      bottom: -0.375rem;
      left: 50%;
      margin-left: -0.3125rem;
      border-top: none;
      border-left: none;
    }

    .card.bottom::before {
      top: -0.375rem;
      left: 50%;
      margin-left: -0.3125rem;
      border-bottom: none;
      border-right: none;
    }

    .card.left::before {
      right: -0.375rem;
      top: 50%;
      margin-top: -0.3125rem;
      border-top: none;
      border-left: none;
    }

    .card.right::before {
      left: -0.375rem;
      top: 50%;
      margin-top: -0.3125rem;
      border-bottom: none;
      border-right: none;
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .icon-wrap {
      flex-shrink: 0;
      color: var(--sl-color-primary-600, #2563eb);
      font-size: 1rem;
      line-height: 1.5;
    }

    .message {
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--sl-color-neutral-700, #374151);
      flex: 1;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.625rem;
    }

    /* Fade in/out — skipped when prefers-reduced-motion */
    @media (prefers-reduced-motion: no-preference) {
      .card {
        animation: tip-fade-in 0.2s ease forwards;
      }

      .card.dismissing {
        animation: tip-fade-out 0.2s ease forwards;
      }

      @keyframes tip-fade-in {
        from { opacity: 0; transform: translateX(-50%) translateY(4px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      .card.left,
      .card.right {
        animation: tip-fade-in-y 0.2s ease forwards;
      }

      .card.left.dismissing,
      .card.right.dismissing {
        animation: tip-fade-out-y 0.2s ease forwards;
      }

      @keyframes tip-fade-in-y {
        from { opacity: 0; transform: translateY(-50%) translateX(4px); }
        to   { opacity: 1; transform: translateY(-50%) translateX(0); }
      }

      @keyframes tip-fade-out {
        from { opacity: 1; }
        to   { opacity: 0; }
      }

      @keyframes tip-fade-out-y {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
    }
  `;

  /** Which help tip this component tracks in localStorage */
  @property({ type: String, attribute: 'tip-key' }) tipKey!: HelpTipKey;

  /** The help message to display */
  @property({ type: String }) message = '';

  /** Where the card appears relative to the slotted content */
  @property({ type: String }) position: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

  /**
   * When true, the tip is eligible to show (if not already seen).
   * Set to false to prevent the tip from appearing even when unseen.
   */
  @property({ type: Boolean }) active = false;

  /** Auto-dismiss delay in milliseconds (default 5 seconds) */
  @property({ type: Number }) duration = 5000;

  @state() private _visible = false;
  @state() private _dismissing = false;

  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  override updated(changed: Map<string, unknown>) {
    if (changed.has('active') || changed.has('tipKey')) {
      if (this.active && this.tipKey && !hasSeenTip(this.tipKey)) {
        this._show();
      } else if (!this.active) {
        this._hideSilently();
      }
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanup();
  }

  private _show() {
    this._visible = true;
    this._dismissing = false;

    // Auto-dismiss timer
    this._timer = setTimeout(() => this._dismiss(), this.duration);

    // Click-outside listener (attached to document, one-shot per open)
    this._clickOutsideHandler = (e: MouseEvent) => {
      if (!this.renderRoot.contains(e.target as Node)) {
        this._dismiss();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler, true);

    // Escape key listener
    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._dismiss();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
  }

  private _dismiss() {
    if (!this._visible) return;
    markTipSeen(this.tipKey);
    this._cleanup();

    // Check if reduced-motion is preferred — skip animation if so
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this._visible = false;
      this._dismissing = false;
    } else {
      this._dismissing = true;
      // Remove after animation completes (~200ms)
      setTimeout(() => {
        this._visible = false;
        this._dismissing = false;
      }, 220);
    }

    this.dispatchEvent(
      new CustomEvent('tip-dismissed', {
        detail: { tipKey: this.tipKey },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _hideSilently() {
    this._visible = false;
    this._dismissing = false;
    this._cleanup();
  }

  private _cleanup() {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler, true);
      this._clickOutsideHandler = null;
    }
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
  }

  render() {
    return html`
      <div class="anchor">
        <slot></slot>
        ${this._visible ? html`
          <div
            class="card ${this.position}${this._dismissing ? ' dismissing' : ''}"
            role="tooltip"
            aria-live="polite"
          >
            <div class="card-header">
              <span class="icon-wrap" aria-hidden="true">
                <sl-icon name="lightbulb"></sl-icon>
              </span>
              <span class="message">${this.message}</span>
            </div>
            <div class="footer">
              <sl-button
                size="small"
                variant="primary"
                @click=${this._dismiss}
              >${t('helpTip.gotIt')}</sl-button>
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'help-tip': HelpTip;
  }
}
