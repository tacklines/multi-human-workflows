import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

import '../components/visualization/go-no-go-verdict.js';

const meta: Meta = {
  title: 'Visualization/GoNoGoVerdict',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * GO verdict — all checks pass. Triggers green pulse animation and CSS confetti
 * on load. The celebration message shows aligned contracts and aggregates.
 * (Respects prefers-reduced-motion: animation is skipped if the OS setting is on.)
 */
export const Go: Story = {
  name: 'GO — All Systems Go',
  render: () => html`
    <div style="max-width: 480px; padding: 1.5rem;">
      <go-no-go-verdict
        verdict="go"
        summary="All checks pass. Ready to ship."
        contractCount="8"
        aggregateCount="5"
      ></go-no-go-verdict>
    </div>
  `,
};

/**
 * NO-GO verdict — critical checks failed.
 * Red background with X icon, issue count in summary.
 */
export const NoGo: Story = {
  name: 'NO-GO — Issues Require Resolution',
  render: () => html`
    <div style="max-width: 480px; padding: 1.5rem;">
      <go-no-go-verdict
        verdict="no-go"
        summary="3 issues require resolution."
        issueCount="3"
      ></go-no-go-verdict>
    </div>
  `,
};

/**
 * CAUTION verdict — critical checks pass, but advisory items remain.
 * Amber background with warning triangle.
 */
export const Caution: Story = {
  name: 'CAUTION — Advisory Items Found',
  render: () => html`
    <div style="max-width: 480px; padding: 1.5rem;">
      <go-no-go-verdict
        verdict="caution"
        summary="All critical checks pass, but 2 advisory items found."
        issueCount="2"
      ></go-no-go-verdict>
    </div>
  `,
};
