import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { IntegrationCheck, BoundaryNode, BoundaryConnection } from '../visualization/integration-dashboard.js';
import type { IntegrationReport } from '../../schema/types.js';

import '../visualization/integration-dashboard.js';
import './help-tip.js';

/**
 * `<integration-tab>` — Tab panel wrapper for the Phase VII "Ship" integration dashboard.
 *
 * Accepts integration data as properties, builds the IntegrationReport inline,
 * and re-fires child events upward with `bubbles: true, composed: true`.
 *
 * @fires create-work-item-requested - User clicked "Create work item" on a failed check.
 * @fires run-checks-requested - User clicked "Run checks" button.
 */
@customElement('integration-tab')
export class IntegrationTab extends LitElement {
  static styles = css`:host { display: contents; }`;

  @property({ attribute: false }) checks: IntegrationCheck[] = [];
  @property({ attribute: false }) nodes: BoundaryNode[] = [];
  @property({ attribute: false }) connections: BoundaryConnection[] = [];
  @property() verdict: 'go' | 'no-go' | 'caution' = 'go';
  @property() verdictSummary = '';
  @property({ type: Number }) contractCount = 0;
  @property({ type: Number }) aggregateCount = 0;
  /** Event names from the contract bundle — used to populate IntegrationReport.sourceContracts */
  @property({ attribute: false }) sourceContracts: string[] = [];
  /** Whether this panel is currently active/visible — suppresses report building when false */
  @property({ type: Boolean }) active = false;

  private _buildIntegrationReport(): IntegrationReport | null {
    if (!this.active || this.checks.length === 0) return null;
    return {
      generatedAt: new Date().toISOString(),
      sourceContracts: this.sourceContracts,
      checks: this.checks.map((c) => ({
        name: c.label,
        status: c.status,
        message: c.description,
        details: c.details,
      })),
      overallStatus: this.checks.every((c) => c.status === 'pass')
        ? 'pass'
        : this.checks.some((c) => c.status === 'fail')
          ? 'fail'
          : 'warn',
      summary: this.verdictSummary,
    };
  }

  render() {
    const report = this._buildIntegrationReport();
    return html`
      <help-tip tip-key="integration-dashboard" message=${t('helpTip.integrationDashboard')} ?active=${this.checks.length > 0}>
        <integration-dashboard
          .checks=${this.checks}
          .nodes=${this.nodes}
          .connections=${this.connections}
          verdict=${this.verdict}
          verdictSummary=${this.verdictSummary}
          contractCount=${this.contractCount}
          aggregateCount=${this.aggregateCount}
          .integrationReport=${report}
          @create-work-item-requested=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('create-work-item-requested', {
                detail: (e as CustomEvent).detail,
                bubbles: true,
                composed: true,
              })
            )}
          @run-checks-requested=${() =>
            this.dispatchEvent(
              new CustomEvent('run-checks-requested', { bubbles: true, composed: true })
            )}
        ></integration-dashboard>
      </help-tip>
    `;
  }
}
