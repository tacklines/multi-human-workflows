import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { Draft } from '../schema/types.js';

// Register the component
import '../components/session/draft-editor.js';

const baseDraft: Draft = {
  id: 'draft-001',
  participantId: 'participant-abc',
  content: {
    metadata: {
      role: 'Order Service',
      scope: 'session',
      goal: 'Capture order lifecycle events',
      generated_at: '2026-03-02T10:00:00Z',
      event_count: 3,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'OrderPlaced',
        aggregate: 'Order',
        trigger: 'Customer submits cart',
        payload: [],
        integration: { direction: 'outbound' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'PaymentProcessed',
        aggregate: 'Payment',
        trigger: 'OrderPlaced',
        payload: [],
        integration: { direction: 'internal' },
        confidence: 'LIKELY',
      },
      {
        name: 'OrderShipped',
        aggregate: 'Shipment',
        trigger: 'Warehouse confirms pickup',
        payload: [],
        integration: { direction: 'outbound' },
        confidence: 'POSSIBLE',
      },
    ],
    boundary_assumptions: [],
  },
  createdAt: '2026-03-02T09:45:00Z',
  updatedAt: '2026-03-02T10:05:00Z',
  publishedAt: null,
};

const publishedDraft: Draft = {
  ...baseDraft,
  id: 'draft-002',
  publishedAt: '2026-03-02T10:30:00Z',
};

const meta: Meta = {
  title: 'Session/DraftEditor',
  tags: ['autodocs'],
  render: (args) => html`
    <div style="max-width: 800px; padding: 1rem;">
      <draft-editor
        .draft=${args.draft as Draft | null}
        ?readonly=${args.readonly ?? false}
        @draft-publish=${(e: CustomEvent) => console.log('draft-publish', e.detail)}
        @draft-discard=${(e: CustomEvent) => console.log('draft-discard', e.detail)}
        @draft-change=${(e: CustomEvent) => console.log('draft-change', e.detail)}
      ></draft-editor>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** Editing a draft — all fields are editable, publish/discard buttons visible. */
export const Editing: Story = {
  name: 'Editing a draft',
  args: {
    draft: baseDraft,
    readonly: false,
  },
};

/** Read-only view — inputs are replaced with text, no action buttons. */
export const ReadOnly: Story = {
  name: 'Read-only draft view',
  args: {
    draft: baseDraft,
    readonly: true,
  },
};

/** Published draft — shows published timestamp, no edit controls. */
export const Published: Story = {
  name: 'Published draft',
  args: {
    draft: publishedDraft,
    readonly: false,
  },
};

/** Empty draft — no events in content. */
export const EmptyEvents: Story = {
  name: 'Draft with no events',
  args: {
    draft: {
      ...baseDraft,
      id: 'draft-003',
      content: {
        ...baseDraft.content,
        domain_events: [],
        metadata: { ...baseDraft.content.metadata, event_count: 0 },
      },
    },
    readonly: false,
  },
};

/** Null draft — renders empty state. */
export const NullDraft: Story = {
  name: 'No draft selected',
  args: {
    draft: null,
    readonly: false,
  },
};
