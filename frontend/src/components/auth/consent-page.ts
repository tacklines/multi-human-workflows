import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";

interface ConsentClient {
  client_id: string;
  client_name?: string;
}

interface ConsentRequest {
  client: ConsentClient;
  requested_scope: string[];
  skip?: boolean;
  redirect_to?: string;
}

// Client IDs treated as first-party (auto-accept without UI)
const FIRST_PARTY_CLIENT_IDS = ["web-app", "seam-web", "seam"];

@customElement("auth-consent-page")
export class AuthConsentPage extends LitElement {
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
    }

    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary, #fff);
      letter-spacing: -0.025em;
    }

    .client-name {
      margin: 0 0 1.5rem;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      font-size: 0.875rem;
    }

    .client-name strong {
      color: var(--text-primary, #fff);
    }

    .scopes {
      margin-bottom: 1.5rem;
    }

    .scopes-title {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      margin-bottom: 0.75rem;
    }

    .scope-item {
      display: flex;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
    }

    .scope-item:last-child {
      border-bottom: none;
    }

    .scope-name {
      color: var(--text-primary, #fff);
      font-size: 0.9rem;
      margin-left: 0.5rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .actions sl-button {
      flex: 1;
    }

    sl-alert {
      margin-bottom: 1rem;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      padding: 2rem 0;
    }

    .auto-accepting {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 0;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
    }
  `;

  @state() private _consentRequest: ConsentRequest | null = null;
  @state() private _loading = true;
  @state() private _processing = false;
  @state() private _error: string | null = null;
  @state() private _consentChallenge: string | null = null;
  @state() private _selectedScopes: Set<string> = new Set();
  @state() private _autoAccepting = false;

  connectedCallback() {
    super.connectedCallback();
    this._init();
  }

  private async _init() {
    const params = new URLSearchParams(window.location.search);
    const challenge = params.get("consent_challenge");
    this._consentChallenge = challenge;

    if (!challenge) {
      this._error = t("auth.consent.errorNoChallenge");
      this._loading = false;
      return;
    }

    try {
      const res = await fetch(
        `/api/auth/consent?consent_challenge=${encodeURIComponent(challenge)}`,
      );
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data: ConsentRequest = await res.json();
      this._consentRequest = data;

      // If Hydra says skip, or it's a first-party client, auto-accept
      const isFirstParty = FIRST_PARTY_CLIENT_IDS.includes(
        data.client.client_id,
      );
      if (data.skip || isFirstParty) {
        this._autoAccepting = true;
        this._loading = false;
        await this._accept(data.requested_scope);
        return;
      }

      // Pre-select all scopes
      this._selectedScopes = new Set(data.requested_scope);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.consent.errorLoad");
    } finally {
      if (!this._autoAccepting) {
        this._loading = false;
      }
    }
  }

  private async _accept(scopes?: string[]) {
    const challenge = this._consentChallenge;
    if (!challenge) return;

    const grantScope = scopes ?? [...this._selectedScopes];
    this._processing = true;

    try {
      const res = await fetch(
        `/api/auth/consent/accept?consent_challenge=${encodeURIComponent(challenge)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_scope: grantScope,
            remember: true,
            remember_for: 3600,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`Accept failed: ${res.status}`);
      }

      const data = await res.json();
      if (data.redirect_to) {
        window.location.href = data.redirect_to;
      }
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.consent.errorAccept");
      this._processing = false;
      this._autoAccepting = false;
      this._loading = false;
    }
  }

  private async _deny() {
    const challenge = this._consentChallenge;
    if (!challenge) return;

    this._processing = true;

    try {
      const res = await fetch(
        `/api/auth/consent/reject?consent_challenge=${encodeURIComponent(challenge)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "access_denied",
            error_description: "User denied the request.",
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`Deny failed: ${res.status}`);
      }

      const data = await res.json();
      if (data.redirect_to) {
        window.location.href = data.redirect_to;
      }
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.consent.errorDeny");
      this._processing = false;
    }
  }

  private _toggleScope(scope: string) {
    const next = new Set(this._selectedScopes);
    if (next.has(scope)) {
      next.delete(scope);
    } else {
      next.add(scope);
    }
    this._selectedScopes = next;
  }

  render() {
    if (this._loading) {
      return html`
        <div class="card">
          <div class="loading"><sl-spinner></sl-spinner></div>
        </div>
      `;
    }

    if (this._autoAccepting) {
      return html`
        <div class="card">
          <div class="auto-accepting">
            <sl-spinner style="font-size: 2rem;"></sl-spinner>
            <span>${t("auth.consent.autoAccepting")}</span>
          </div>
        </div>
      `;
    }

    const req = this._consentRequest;

    return html`
      <div class="card">
        <h1>${t("auth.consent.title")}</h1>

        ${req
          ? html`
              <p class="client-name">
                <strong
                  >${req.client.client_name ?? req.client.client_id}</strong
                >
                ${t("auth.consent.requestsAccess")}
              </p>
            `
          : nothing}
        ${this._error
          ? html`
              <sl-alert variant="danger" open>
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                ${this._error}
              </sl-alert>
            `
          : nothing}
        ${req?.requested_scope?.length
          ? html`
              <div class="scopes">
                <div class="scopes-title">
                  ${t("auth.consent.requestedScopes")}
                </div>
                ${req.requested_scope.map(
                  (scope) => html`
                    <div class="scope-item">
                      <sl-checkbox
                        ?checked="${this._selectedScopes.has(scope)}"
                        @sl-change="${() => this._toggleScope(scope)}"
                      ></sl-checkbox>
                      <span class="scope-name">${scope}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}

        <div class="actions">
          <sl-button
            variant="default"
            ?disabled="${this._processing}"
            @click="${() => this._deny()}"
          >
            ${t("auth.consent.deny")}
          </sl-button>
          <sl-button
            variant="primary"
            ?loading="${this._processing}"
            ?disabled="${this._processing || this._selectedScopes.size === 0}"
            @click="${() => this._accept()}"
          >
            ${t("auth.consent.approve")}
          </sl-button>
        </div>
      </div>
    `;
  }
}
