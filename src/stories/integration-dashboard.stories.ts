import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { IntegrationCheck, BoundaryNode, BoundaryConnection } from '../components/visualization/integration-dashboard.js';

import '../components/visualization/integration-dashboard.js';

// ---- Shared sample data ----

const NODES: BoundaryNode[] = [
  { id: 'orders', label: 'Order Management' },
  { id: 'payments', label: 'Payments' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'notifications', label: 'Notifications' },
];

const CHECKS_ALL_PASSING: IntegrationCheck[] = [
  {
    id: 'c1',
    label: 'Schema compatibility',
    description: 'All event schemas are backward-compatible with registered consumers.',
    status: 'pass',
    details: 'Checked 12 event schemas across 4 bounded contexts. All fields preserved.',
  },
  {
    id: 'c2',
    label: 'Ownership coverage',
    description: 'Every aggregate has an assigned owner role.',
    status: 'pass',
    details: '8 aggregates, 8 owners assigned.',
  },
  {
    id: 'c3',
    label: 'Contract alignment',
    description: 'All contracts have been accepted by both producer and consumer.',
    status: 'pass',
    details: '8 contracts, all in accepted state.',
  },
  {
    id: 'c4',
    label: 'Conflict resolution',
    description: 'All detected conflicts have been resolved.',
    status: 'pass',
    details: '5 conflicts identified, 5 resolved.',
  },
];

const CONNECTIONS_ALL_PASSING: BoundaryConnection[] = [
  { from: 'orders', to: 'payments', status: 'pass', label: 'OrderPlaced' },
  { from: 'payments', to: 'inventory', status: 'pass', label: 'PaymentConfirmed' },
  { from: 'inventory', to: 'shipping', status: 'pass', label: 'InventoryReserved' },
  { from: 'shipping', to: 'notifications', status: 'pass', label: 'ShipmentCreated' },
];

// ---- Mixed results (CAUTION) ----

const CHECKS_MIXED: IntegrationCheck[] = [
  {
    id: 'c1',
    label: 'Schema compatibility',
    description: 'All event schemas are backward-compatible with registered consumers.',
    status: 'pass',
    details: 'Checked 12 event schemas across 4 bounded contexts.',
  },
  {
    id: 'c2',
    label: 'Ownership coverage',
    description: 'Every aggregate has an assigned owner role.',
    status: 'warn',
    details: 'The Analytics context has 1 unassigned aggregate: "ReportAggregate".',
    owner: 'Team Lead',
  },
  {
    id: 'c3',
    label: 'Contract alignment',
    description: 'All contracts have been accepted by both producer and consumer.',
    status: 'pass',
    details: '7 of 8 contracts accepted. 1 pending acknowledgement.',
  },
  {
    id: 'c4',
    label: 'Conflict resolution',
    description: 'All detected conflicts have been resolved.',
    status: 'warn',
    details: '1 conflict is still flagged for follow-up: "Shared OrderId format".',
    owner: 'Alice',
  },
];

const CONNECTIONS_MIXED: BoundaryConnection[] = [
  { from: 'orders', to: 'payments', status: 'pass', label: 'OrderPlaced' },
  { from: 'payments', to: 'inventory', status: 'warn', label: 'PaymentConfirmed' },
  { from: 'inventory', to: 'shipping', status: 'pass', label: 'InventoryReserved' },
  { from: 'shipping', to: 'notifications', status: 'warn', label: 'ShipmentCreated' },
];

// ---- Failed checks (NO-GO) ----

const CHECKS_FAILED: IntegrationCheck[] = [
  {
    id: 'c1',
    label: 'Schema compatibility',
    description: 'All event schemas are backward-compatible with registered consumers.',
    status: 'fail',
    details: 'OrderPlaced v3 removes required field "customerId" — breaks 2 downstream consumers.',
    owner: 'Alice',
  },
  {
    id: 'c2',
    label: 'Ownership coverage',
    description: 'Every aggregate has an assigned owner role.',
    status: 'pass',
    details: '8 aggregates, 8 owners assigned.',
  },
  {
    id: 'c3',
    label: 'Contract alignment',
    description: 'All contracts have been accepted by both producer and consumer.',
    status: 'fail',
    details: 'PaymentProcessed contract rejected by Inventory team due to missing "currency" field.',
    owner: 'Bob',
  },
  {
    id: 'c4',
    label: 'Conflict resolution',
    description: 'All detected conflicts have been resolved.',
    status: 'warn',
    details: '"ShipmentCreated vs OrderFulfilled" naming conflict flagged but not yet resolved.',
    owner: 'Carol',
  },
];

const CONNECTIONS_FAILED: BoundaryConnection[] = [
  { from: 'orders', to: 'payments', status: 'fail', label: 'OrderPlaced' },
  { from: 'payments', to: 'inventory', status: 'fail', label: 'PaymentProcessed' },
  { from: 'inventory', to: 'shipping', status: 'pass', label: 'InventoryReserved' },
  { from: 'shipping', to: 'notifications', status: 'warn', label: 'ShipmentCreated' },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Visualization/IntegrationDashboard',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * All integration checks pass — GO verdict with green pulse and confetti.
 * All boundary connections are compliant (green lines).
 */
export const AllPassing: Story = {
  name: 'All Passing (GO)',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb;">
      <integration-dashboard
        verdict="go"
        contractCount="8"
        aggregateCount="5"
        .checks=${CHECKS_ALL_PASSING as IntegrationCheck[]}
        .nodes=${NODES as BoundaryNode[]}
        .connections=${CONNECTIONS_ALL_PASSING as BoundaryConnection[]}
        @create-work-item-requested=${(e: CustomEvent) => console.log('create-work-item-requested', e.detail)}
        @check-detail-requested=${(e: CustomEvent) => console.log('check-detail-requested', e.detail)}
        @run-checks-requested=${() => console.log('run-checks-requested')}
      ></integration-dashboard>
    </div>
  `,
};

/**
 * Advisory items found but no critical failures — CAUTION verdict.
 * Two checks have warnings; boundary connections show amber advisory lines.
 */
export const MixedResults: Story = {
  name: 'Mixed Results (CAUTION)',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb;">
      <integration-dashboard
        verdict="caution"
        .checks=${CHECKS_MIXED as IntegrationCheck[]}
        .nodes=${NODES as BoundaryNode[]}
        .connections=${CONNECTIONS_MIXED as BoundaryConnection[]}
        @create-work-item-requested=${(e: CustomEvent) => console.log('create-work-item-requested', e.detail)}
        @check-detail-requested=${(e: CustomEvent) => console.log('check-detail-requested', e.detail)}
        @run-checks-requested=${() => console.log('run-checks-requested')}
      ></integration-dashboard>
    </div>
  `,
};

/**
 * Critical checks failed — NO-GO verdict.
 * Two checks show errors with "Create work item" buttons. Red boundary connections
 * highlight the non-compliant integrations.
 */
export const FailedChecks: Story = {
  name: 'Failed Checks (NO-GO)',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb;">
      <integration-dashboard
        verdict="no-go"
        .checks=${CHECKS_FAILED as IntegrationCheck[]}
        .nodes=${NODES as BoundaryNode[]}
        .connections=${CONNECTIONS_FAILED as BoundaryConnection[]}
        @create-work-item-requested=${(e: CustomEvent) => console.log('create-work-item-requested', e.detail)}
        @check-detail-requested=${(e: CustomEvent) => console.log('check-detail-requested', e.detail)}
        @run-checks-requested=${() => console.log('run-checks-requested')}
      ></integration-dashboard>
    </div>
  `,
};
