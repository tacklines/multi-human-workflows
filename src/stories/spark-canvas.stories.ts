import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

// Register the component
import '../components/session/spark-canvas.js';
import type { SparkCanvas } from '../components/session/spark-canvas.js';

const meta: Meta = {
  title: 'Session/SparkCanvas',
  tags: ['autodocs'],
  render: (args) => html`
    <div style="max-width: 800px; padding: 1rem;">
      <spark-canvas
        session-code=${args.sessionCode ?? ''}
        ?collapsed=${args.collapsed ?? false}
        @spark-submit=${(e: CustomEvent) => console.log('spark-submit', e.detail)}
        @spark-expand=${() => console.log('spark-expand')}
      ></spark-canvas>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** Empty canvas — blank start with one placeholder row. */
export const Empty: Story = {
  name: 'Empty canvas (blank start)',
  args: {
    sessionCode: 'ABC123',
    collapsed: false,
  },
};

/** Canvas with a few rows filled in by the user. */
export const FilledRows: Story = {
  name: 'Canvas with rows filled in',
  render: () => html`
    <div style="max-width: 800px; padding: 1rem;">
      <spark-canvas
        session-code="ABC123"
        @spark-submit=${(e: CustomEvent) => console.log('spark-submit', e.detail)}
      ></spark-canvas>
    </div>
    <script>
      // Pre-fill rows via the component's internal state after first render
      customElements.whenDefined('spark-canvas').then(() => {
        const el = document.querySelector('spark-canvas') as SparkCanvas & { _rows: unknown };
        if (el) {
          el['_rows'] = [
            { eventName: 'OrderPlaced', aggregate: 'Order', trigger: 'Customer submits cart' },
            { eventName: 'PaymentProcessed', aggregate: 'Payment', trigger: 'OrderPlaced' },
            { eventName: 'InventoryReserved', aggregate: 'Inventory', trigger: 'OrderPlaced' },
            { eventName: '', aggregate: '', trigger: '' },
          ];
        }
      });
    </script>
  `,
};

/** Canvas pre-loaded with the e-commerce template. */
export const EcommerceTemplate: Story = {
  name: 'E-commerce template loaded',
  render: () => html`
    <div style="max-width: 800px; padding: 1rem;">
      <spark-canvas
        session-code="XYZ789"
        @spark-submit=${(e: CustomEvent) => console.log('spark-submit', e.detail)}
      ></spark-canvas>
    </div>
    <script>
      customElements.whenDefined('spark-canvas').then(() => {
        const el = document.querySelector('spark-canvas') as SparkCanvas & { _rows: unknown; _selectedTemplate: string };
        if (el) {
          el['_selectedTemplate'] = 'ecommerce';
          el['_rows'] = [
            { eventName: 'OrderPlaced', aggregate: 'Order', trigger: 'Customer submits cart' },
            { eventName: 'PaymentProcessed', aggregate: 'Payment', trigger: 'OrderPlaced' },
            { eventName: 'InventoryReserved', aggregate: 'Inventory', trigger: 'OrderPlaced' },
            { eventName: 'OrderShipped', aggregate: 'Shipment', trigger: 'Warehouse confirms pickup' },
            { eventName: 'OrderDelivered', aggregate: 'Shipment', trigger: 'Carrier confirms delivery' },
            { eventName: '', aggregate: '', trigger: '' },
          ];
        }
      });
    </script>
  `,
};

/** Collapsed mode — shown after first submit. */
export const Collapsed: Story = {
  name: 'Collapsed mode',
  args: {
    sessionCode: 'ABC123',
    collapsed: true,
  },
};

/** YAML view — toggle to raw YAML editor. */
export const YamlView: Story = {
  name: 'YAML view mode',
  render: () => html`
    <div style="max-width: 800px; padding: 1rem;">
      <spark-canvas
        session-code="ABC123"
        @spark-submit=${(e: CustomEvent) => console.log('spark-submit', e.detail)}
      ></spark-canvas>
    </div>
    <script>
      customElements.whenDefined('spark-canvas').then(() => {
        const el = document.querySelector('spark-canvas') as SparkCanvas & { _viewMode: string; _yamlText: string; _rows: unknown };
        if (el) {
          el['_rows'] = [
            { eventName: 'UserRegistered', aggregate: 'User', trigger: 'User submits form' },
            { eventName: 'EmailVerified', aggregate: 'User', trigger: 'UserRegistered' },
            { eventName: '', aggregate: '', trigger: '' },
          ];
          el['_viewMode'] = 'yaml';
          el['_yamlText'] = 'domain_events:\n  - name: UserRegistered\n    aggregate: User\n    trigger: User submits form\n  - name: EmailVerified\n    aggregate: User\n    trigger: UserRegistered';
        }
      });
    </script>
  `,
};

/** Solo mode — no session code. */
export const SoloMode: Story = {
  name: 'Solo mode (no session)',
  args: {
    sessionCode: '',
    collapsed: false,
  },
};
