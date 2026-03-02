import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { BoundaryNode, BoundaryConnection } from '../components/visualization/boundary-map.js';

import '../components/visualization/boundary-map.js';

// ---- Sample data ----

const NODES_ALL_COMPLIANT: BoundaryNode[] = [
  { id: 'orders', label: 'Order Management' },
  { id: 'payments', label: 'Payments' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'notifications', label: 'Notifications' },
];

const CONNECTIONS_ALL_COMPLIANT: BoundaryConnection[] = [
  { from: 'orders', to: 'payments', status: 'pass', label: 'OrderPlaced' },
  { from: 'payments', to: 'inventory', status: 'pass', label: 'PaymentConfirmed' },
  { from: 'inventory', to: 'shipping', status: 'pass', label: 'InventoryReserved' },
  { from: 'shipping', to: 'notifications', status: 'pass', label: 'ShipmentCreated' },
];

const NODES_MIXED: BoundaryNode[] = [
  { id: 'orders', label: 'Order Management' },
  { id: 'payments', label: 'Payments' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'notifications', label: 'Notifications' },
];

const CONNECTIONS_MIXED: BoundaryConnection[] = [
  { from: 'orders', to: 'payments', status: 'pass', label: 'OrderPlaced' },
  { from: 'payments', to: 'inventory', status: 'warn', label: 'PaymentConfirmed' },
  { from: 'inventory', to: 'shipping', status: 'pass', label: 'InventoryReserved' },
  { from: 'shipping', to: 'notifications', status: 'fail', label: 'ShipmentCreated' },
  { from: 'orders', to: 'analytics', status: 'warn', label: 'OrderMetrics' },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Visualization/BoundaryMap',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * All connections are compliant (green lines).
 * A visually-hidden table below the SVG provides the same data for screen readers.
 */
export const AllCompliant: Story = {
  name: 'All Compliant',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 700px;">
      <boundary-map
        .nodes=${NODES_ALL_COMPLIANT as BoundaryNode[]}
        .connections=${CONNECTIONS_ALL_COMPLIANT as BoundaryConnection[]}
      ></boundary-map>
    </div>
  `,
};

/**
 * Mixed compliance: some connections pass, some have warnings, one fails.
 * Green = compliant, amber = advisory, red = non-compliant.
 */
export const MixedCompliance: Story = {
  name: 'Mixed Compliance',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 800px;">
      <boundary-map
        .nodes=${NODES_MIXED as BoundaryNode[]}
        .connections=${CONNECTIONS_MIXED as BoundaryConnection[]}
      ></boundary-map>
    </div>
  `,
};
