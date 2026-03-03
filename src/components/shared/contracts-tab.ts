import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { ContractBundle } from '../../schema/types.js';
import type { ComplianceDetail } from '../artifact/compliance-badge.js';
import type { ProvenanceStep } from '../contract/provenance-explorer.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '../contract/contract-diff.js';
import '../contract/schema-display.js';
import '../contract/provenance-explorer.js';
import './help-tip.js';

/**
 * `<contracts-tab>` — Tab panel wrapper for the Phase VI "Build" contracts view.
 *
 * Manages its own bundle-diff tracking state (_previousContractBundle).
 * Re-fires `integration-check-requested` from the CTA button.
 *
 * @fires integration-check-requested - User clicked "Run integration check" CTA.
 */
@customElement('contracts-tab')
export class ContractsTab extends LitElement {
  static styles = css`
    :host { display: contents; }

    .integration-cta {
      margin-top: 1.5rem;
      border-radius: 12px;
      padding: 1.5rem;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border: 2px solid #93c5fd;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      display: flex;
      align-items: center;
      gap: 1.25rem;
      animation: integration-cta-in 400ms ease-out;
    }

    @keyframes integration-cta-in {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .integration-cta { animation: none; }
    }

    .integration-cta-icon {
      flex-shrink: 0;
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: #1d4ed8;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      line-height: 1;
    }

    .integration-cta-body {
      flex: 1;
      min-width: 0;
    }

    .integration-cta-heading {
      font-size: 1.125rem;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0 0 0.25rem;
    }

    .integration-cta-description {
      font-size: 0.9375rem;
      color: #1e40af;
      margin: 0;
    }
  `;

  /** The contract bundle (eventContracts + boundaryContracts) derived from loaded files */
  @property({ attribute: false }) bundle: ContractBundle = {
    generatedAt: '',
    eventContracts: [],
    boundaryContracts: [],
  };

  /** Combined schema map: eventName -> schema object */
  @property({ attribute: false }) schemas: Record<string, unknown> = {};

  /** Compliance status derived from conflict analysis */
  @property({ attribute: false }) compliance: { status: 'pass' | 'warn' | 'fail'; details: ComplianceDetail[] } = {
    status: 'pass',
    details: [],
  };

  /** Provenance chain tracing the lineage of contracts */
  @property({ attribute: false }) provenanceChain: ProvenanceStep[] = [];

  /** Number of work items — used to determine if the integration CTA should show */
  @property({ type: Number }) workItemCount = 0;

  /** Whether all work items have reported 100% progress — required for the integration CTA */
  @property({ type: Boolean }) workItemsAllComplete = false;

  /** Previous bundle snapshot for diff display; managed internally */
  @state() private _previousContractBundle: ContractBundle | null = null;

  /** Last seen bundle (for detecting changes) */
  private _lastSeenCount = 0;
  private _lastContractBundle: ContractBundle | null = null;

  override willUpdate() {
    // Rotate bundles when contract count changes so contract-diff can show before/after
    const currentCount = this.bundle.eventContracts.length;
    if (currentCount > 0 && currentCount !== this._lastSeenCount) {
      this._previousContractBundle = this._lastContractBundle;
      this._lastContractBundle = this.bundle;
      this._lastSeenCount = currentCount;
    }
  }

  render() {
    const showIntegrationCta =
      this.workItemCount > 0 &&
      this.workItemsAllComplete &&
      this.compliance.status === 'pass' &&
      this.bundle.eventContracts.length > 0;

    return html`
      <help-tip tip-key="contracts-tab" message=${t('helpTip.contractsTab')} ?active=${this.bundle.eventContracts.length > 0}>
        <contract-diff
          .bundleBefore=${this._previousContractBundle}
          .bundleAfter=${this.bundle}
        ></contract-diff>
        <schema-display
          .schema=${this.schemas}
          label=${t('shell.contracts.schemaLabel')}
        ></schema-display>
        <provenance-explorer
          .chain=${this.provenanceChain}
          subject=${t('shell.contracts.provenanceSubject')}
        ></provenance-explorer>
        ${showIntegrationCta ? html`
          <div
            class="integration-cta"
            role="status"
            aria-label="${t('shell.contracts.integrationCta.heading')}: ${t('shell.contracts.integrationCta.description')}"
          >
            <div class="integration-cta-icon" aria-hidden="true">&#10003;</div>
            <div class="integration-cta-body">
              <div class="integration-cta-heading">${t('shell.contracts.integrationCta.heading')}</div>
              <p class="integration-cta-description">${t('shell.contracts.integrationCta.description')}</p>
            </div>
            <sl-button
              variant="primary"
              size="large"
              aria-label="${t('shell.contracts.integrationCta.button')}"
              @click=${this._onIntegrationCtaClick}
            >${t('shell.contracts.integrationCta.button')}</sl-button>
          </div>
        ` : ''}
      </help-tip>
    `;
  }

  private _onIntegrationCtaClick() {
    this.dispatchEvent(
      new CustomEvent('integration-check-requested', { bubbles: true, composed: true })
    );
  }
}
