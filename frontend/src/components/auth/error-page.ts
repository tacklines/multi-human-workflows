import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import { navigateTo } from "../../router.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";

interface KratosError {
  id: string;
  error: {
    code?: number;
    status?: string;
    message: string;
    reason?: string;
  };
}

@customElement("auth-error-page")
export class AuthErrorPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--surface-1, #111320);
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: var(--surface-card, #1a1d2e);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      text-align: center;
    }

    .icon-wrap {
      font-size: 3rem;
      margin-bottom: 1rem;
      color: var(--sl-color-danger-400, #f87171);
    }

    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary, #fff);
    }

    .message {
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      font-size: 0.9rem;
      margin: 0 0 1.5rem;
      line-height: 1.5;
    }

    .reason {
      font-size: 0.8rem;
      color: var(--text-tertiary, rgba(255, 255, 255, 0.3));
      margin-bottom: 1.5rem;
      font-family: monospace;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      padding: 2rem 0;
    }
  `;

  @state() private _kratosError: KratosError | null = null;
  @state() private _loading = true;
  @state() private _fetchError: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._fetchError_();
  }

  private async _fetchError_() {
    const params = new URLSearchParams(window.location.search);
    const errorId = params.get("id");

    if (!errorId) {
      this._fetchError = t("auth.error.noId");
      this._loading = false;
      return;
    }

    try {
      const res = await fetch(
        `/kratos/self-service/errors?id=${encodeURIComponent(errorId)}`,
        {
          headers: { Accept: "application/json" },
        },
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch error details: ${res.status}`);
      }

      this._kratosError = await res.json();
    } catch (err) {
      this._fetchError =
        err instanceof Error ? err.message : t("auth.error.fetchFailed");
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <div class="card">
        ${this._loading
          ? html`<div class="loading"><sl-spinner></sl-spinner></div>`
          : html`
              <div class="icon-wrap">
                <sl-icon name="exclamation-triangle-fill"></sl-icon>
              </div>
              <h1>${t("auth.error.title")}</h1>

              ${this._kratosError
                ? html`
                    <p class="message">${this._kratosError.error.message}</p>
                    ${this._kratosError.error.reason
                      ? html`<p class="reason">
                          ${this._kratosError.error.reason}
                        </p>`
                      : nothing}
                  `
                : html`
                    <p class="message">
                      ${this._fetchError ?? t("auth.error.unknown")}
                    </p>
                  `}

              <sl-button
                variant="primary"
                @click=${() => navigateTo("/auth/login")}
              >
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${t("auth.error.backToLogin")}
              </sl-button>
            `}
      </div>
    `;
  }
}
