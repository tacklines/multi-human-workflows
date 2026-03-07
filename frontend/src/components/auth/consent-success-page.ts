import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

import "@shoelace-style/shoelace/dist/components/icon/icon.js";

@customElement("auth-consent-success-page")
export class AuthConsentSuccessPage extends LitElement {
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
      max-width: 400px;
      background: var(--surface-card, #1a1d2e);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      padding: 2.5rem 2rem;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      text-align: center;
    }

    .check-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(74, 222, 128, 0.1);
      margin-bottom: 1.5rem;
    }

    .check-icon sl-icon {
      font-size: 1.5rem;
      color: #4ade80;
    }

    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary, #fff);
      letter-spacing: -0.025em;
    }

    p {
      margin: 0;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      font-size: 0.875rem;
      line-height: 1.5;
    }
  `;

  render() {
    return html`
      <div class="card">
        <div class="check-icon">
          <sl-icon name="check-lg"></sl-icon>
        </div>
        <h1>Authorization Successful</h1>
        <p>You can close this tab and return to your application.</p>
      </div>
    `;
  }
}
