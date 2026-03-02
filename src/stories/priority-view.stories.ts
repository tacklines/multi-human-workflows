import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { RankedEvent, PrioritySuggestion } from '../components/visualization/priority-view.js';

// Register all three components
import '../components/visualization/priority-view.js';
import '../components/visualization/vote-widget.js';
import '../components/visualization/suggestion-banner.js';

// ---- Sample data ----

const SAMPLE_EVENTS: RankedEvent[] = [
  {
    name: 'OrderPlaced',
    aggregate: 'Order',
    confidence: 'CONFIRMED',
    direction: 'outbound',
    crossRefs: 5,
    compositeScore: 9.2,
    tier: 'must_have',
  },
  {
    name: 'PaymentProcessed',
    aggregate: 'Payment',
    confidence: 'CONFIRMED',
    direction: 'inbound',
    crossRefs: 4,
    compositeScore: 8.7,
    tier: 'must_have',
  },
  {
    name: 'InventoryReserved',
    aggregate: 'Inventory',
    confidence: 'LIKELY',
    direction: 'internal',
    crossRefs: 3,
    compositeScore: 7.1,
    tier: 'must_have',
  },
  {
    name: 'EmailNotificationSent',
    aggregate: 'Notification',
    confidence: 'LIKELY',
    direction: 'outbound',
    crossRefs: 2,
    compositeScore: 5.5,
    tier: 'should_have',
  },
  {
    name: 'UserPreferencesUpdated',
    aggregate: 'User',
    confidence: 'POSSIBLE',
    direction: 'internal',
    crossRefs: 1,
    compositeScore: 4.3,
    tier: 'should_have',
  },
  {
    name: 'ReportGenerated',
    aggregate: 'Reporting',
    confidence: 'POSSIBLE',
    direction: 'internal',
    crossRefs: 0,
    compositeScore: 2.8,
    tier: 'could_have',
  },
  {
    name: 'AuditLogWritten',
    aggregate: 'Audit',
    confidence: 'POSSIBLE',
    direction: 'internal',
    crossRefs: 1,
    compositeScore: 3.1,
    tier: 'could_have',
  },
];

const SAMPLE_VOTES: Record<string, { up: string[]; down: string[] }> = {
  OrderPlaced: { up: ['Alice', 'Bob'], down: [] },
  PaymentProcessed: { up: ['Alice'], down: ['Charlie'] },
  InventoryReserved: { up: [], down: [] },
  EmailNotificationSent: { up: ['Bob'], down: ['Alice'] },
};

const SAMPLE_SUGGESTIONS: PrioritySuggestion[] = [
  {
    id: 'sug-1',
    text: 'Based on cross-references, OrderPlaced and PaymentProcessed appear tightly coupled — consider keeping them in the same tier.',
  },
  {
    id: 'sug-2',
    text: 'ReportGenerated has no cross-references — it could be deferred to a later sprint.',
  },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Visualization/PriorityView',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/** Default: board mode with a full set of events across all three tiers. */
export const BoardMode: Story = {
  name: 'Board Mode (default)',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; min-height: 400px;">
      <priority-view
        .events=${SAMPLE_EVENTS}
        .votes=${{}}
        .currentParticipant=${'Alice'}
        .suggestions=${[]}
        mode="board"
        @priority-changed=${(e: CustomEvent) => console.log('priority-changed', e.detail)}
        @vote-cast=${(e: CustomEvent) => console.log('vote-cast', e.detail)}
      ></priority-view>
    </div>
  `,
};

/** Table mode with sortable columns. */
export const TableMode: Story = {
  name: 'Table Mode',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; min-height: 400px;">
      <priority-view
        .events=${SAMPLE_EVENTS}
        .votes=${{}}
        .currentParticipant=${'Alice'}
        .suggestions=${[]}
        mode="table"
        @priority-changed=${(e: CustomEvent) => console.log('priority-changed', e.detail)}
        @vote-cast=${(e: CustomEvent) => console.log('vote-cast', e.detail)}
      ></priority-view>
    </div>
  `,
};

/** Empty state — no events loaded yet. */
export const EmptyState: Story = {
  name: 'Empty State',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; min-height: 300px;">
      <priority-view
        .events=${[]}
        .votes=${{}}
        .currentParticipant=${'Alice'}
        .suggestions=${[]}
        mode="board"
      ></priority-view>
    </div>
  `,
};

/** Board mode with active agent suggestions shown at the top. */
export const WithSuggestions: Story = {
  name: 'With Agent Suggestions',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; min-height: 400px;">
      <priority-view
        .events=${SAMPLE_EVENTS}
        .votes=${{}}
        .currentParticipant=${'Alice'}
        .suggestions=${SAMPLE_SUGGESTIONS}
        mode="board"
        @suggestion-accepted=${(e: CustomEvent) => console.log('suggestion-accepted', e.detail)}
        @suggestion-dismissed=${(e: CustomEvent) => console.log('suggestion-dismissed', e.detail)}
      ></priority-view>
    </div>
  `,
};

/** Board mode with votes already cast by multiple participants. */
export const WithVotes: Story = {
  name: 'With Votes',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; min-height: 400px;">
      <priority-view
        .events=${SAMPLE_EVENTS}
        .votes=${SAMPLE_VOTES}
        .currentParticipant=${'Alice'}
        .suggestions=${[]}
        mode="board"
        @vote-cast=${(e: CustomEvent) => console.log('vote-cast', e.detail)}
      ></priority-view>
    </div>
  `,
};

/** Narrow viewport simulating mobile. Board stacks into a single column. */
export const MobileViewport: Story = {
  name: 'Mobile Viewport (narrow)',
  render: () => html`
    <div style="max-width: 360px; padding: 1rem; background: #f9fafb; min-height: 500px;">
      <priority-view
        .events=${SAMPLE_EVENTS}
        .votes=${SAMPLE_VOTES}
        .currentParticipant=${'Alice'}
        .suggestions=${SAMPLE_SUGGESTIONS}
        mode="board"
        @priority-changed=${(e: CustomEvent) => console.log('priority-changed', e.detail)}
        @vote-cast=${(e: CustomEvent) => console.log('vote-cast', e.detail)}
        @suggestion-accepted=${(e: CustomEvent) => console.log('suggestion-accepted', e.detail)}
        @suggestion-dismissed=${(e: CustomEvent) => console.log('suggestion-dismissed', e.detail)}
      ></priority-view>
    </div>
  `,
};

// ---- VoteWidget standalone stories ----

/** Vote widget: no votes cast yet. */
export const VoteWidgetDefault: Story = {
  name: 'VoteWidget — No votes',
  render: () => html`
    <div style="padding: 2rem; display: flex; align-items: center; gap: 1.5rem;">
      <vote-widget
        eventName="OrderPlaced"
        .upCount=${0}
        .downCount=${0}
        .upVoters=${[]}
        .downVoters=${[]}
        .currentVote=${null}
        @vote-cast=${(e: CustomEvent) => console.log('vote-cast', e.detail)}
      ></vote-widget>
      <span style="font-size: 0.875rem; color: #6b7280;">Hover to see vote buttons</span>
    </div>
  `,
};

/** Vote widget: current user has upvoted. */
export const VoteWidgetUpvoted: Story = {
  name: 'VoteWidget — Upvoted by current user',
  render: () => html`
    <div style="padding: 2rem;">
      <vote-widget
        eventName="OrderPlaced"
        .upCount=${3}
        .downCount=${1}
        .upVoters=${['Alice', 'Bob', 'You']}
        .downVoters=${['Charlie']}
        .currentVote=${'up'}
        @vote-cast=${(e: CustomEvent) => console.log('vote-cast', e.detail)}
      ></vote-widget>
    </div>
  `,
};

// ---- SuggestionBanner standalone stories ----

/** Suggestion banner with text ready to accept or dismiss. */
export const SuggestionBannerDefault: Story = {
  name: 'SuggestionBanner — With text',
  render: () => html`
    <div style="padding: 1.5rem;">
      <suggestion-banner
        text="OrderPlaced and PaymentProcessed appear tightly coupled — consider grouping them under Must Have."
        suggestionId="sug-1"
        @suggestion-accepted=${(e: CustomEvent) => console.log('accepted', e.detail)}
        @suggestion-dismissed=${(e: CustomEvent) => console.log('dismissed', e.detail)}
      ></suggestion-banner>
    </div>
  `,
};
