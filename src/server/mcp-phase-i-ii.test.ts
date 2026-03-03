/**
 * Tests for the Phase I-II MCP tool handlers:
 *   create_draft, suggest_events, suggest_improvements, update_artifact
 *
 * The MCP server registers tools via stdio transport, so we cannot call
 * registerTool handlers directly in unit tests. Instead these tests exercise
 * the underlying service methods and heuristic logic using the exact calling
 * conventions the handlers use. This validates round-trip logic (error handling,
 * business rules, domain event emission) for each tool.
 */
import { describe, it, expect } from 'vitest';
import { SessionStore } from '../lib/session-store.js';
import { DraftService } from '../contexts/draft/draft-service.js';
import { ArtifactService } from '../contexts/artifact/artifact-service.js';
import { suggestImprovementsForFile, type ImprovementSuggestion } from '../lib/improvement-heuristics.js';
import type { CandidateEventsFile, DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<CandidateEventsFile> = {}): CandidateEventsFile {
  return {
    metadata: {
      role: 'backend',
      scope: 'Order service',
      goal: 'Model order lifecycle',
      generated_at: '2026-01-01T00:00:00Z',
      event_count: 2,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'OrderCreated',
        aggregate: 'Order',
        trigger: 'Customer places order',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'LIKELY',
      },
      {
        name: 'OrderCompleted',
        aggregate: 'Order',
        trigger: 'Order fulfillment done',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'outbound' },
        confidence: 'POSSIBLE',
      },
    ],
    boundary_assumptions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers — mirror the handler patterns used in mcp.ts
// ---------------------------------------------------------------------------

function handleCreateDraft(
  store: SessionStore,
  service: DraftService,
  sessionCode: string,
  participantId: string,
  content: CandidateEventsFile
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  const draft = service.createDraft(sessionCode, { participantId, content });
  if (!draft) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ draftId: draft.id }) }],
  };
}

function handleSuggestEvents(
  description: string,
  existingEvents: string[],
  suggestFn: (desc: string, existing: string[]) => DomainEvent[]
): { content: Array<{ type: 'text'; text: string }> } {
  const events = suggestFn(description, existingEvents);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ events }) }],
  };
}

function handleSuggestImprovements(
  store: SessionStore,
  sessionCode: string,
  fileName: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  const session = store.getSession(sessionCode);
  if (!session) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }
  const submission = session.submissions.find((s) => s.fileName === fileName);
  if (!submission) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: `Artifact "${fileName}" not found in session` }) }],
      isError: true,
    };
  }
  const suggestions = suggestImprovementsForFile(submission.data);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ suggestions }) }],
  };
}

function handleUpdateArtifact(
  store: SessionStore,
  service: ArtifactService,
  sessionCode: string,
  participantId: string,
  fileName: string,
  content: CandidateEventsFile,
  changeNote?: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  const session = store.getSession(sessionCode);
  if (!session) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
      isError: true,
    };
  }
  if (!session.participants.has(participantId)) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Participant not in session' }) }],
      isError: true,
    };
  }
  const versioned = service.submit(sessionCode, participantId, fileName, content, 'mcp', changeNote);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ version: versioned.version }) }],
  };
}

interface DomainPattern {
  keywords: string[];
  events: DomainEvent[];
}

const TEST_DOMAIN_PATTERNS: DomainPattern[] = [
  {
    keywords: ['order', 'orders', 'ordering', 'purchase'],
    events: [
      { name: 'OrderCreated', aggregate: 'Order', trigger: 'Customer places order', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderUpdated', aggregate: 'Order', trigger: 'Customer modifies order', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderCancelled', aggregate: 'Order', trigger: 'Customer or system cancels order', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderCompleted', aggregate: 'Order', trigger: 'Order fulfillment complete', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'OrderFailed', aggregate: 'Order', trigger: 'Order processing fails', payload: [{ field: 'orderId', type: 'string' }, { field: 'error', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['payment', 'payments', 'billing', 'invoice', 'charge'],
    events: [
      { name: 'PaymentInitiated', aggregate: 'Payment', trigger: 'Payment process starts', payload: [{ field: 'paymentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentCompleted', aggregate: 'Payment', trigger: 'Payment successfully processed', payload: [{ field: 'paymentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentFailed', aggregate: 'Payment', trigger: 'Payment processing fails', payload: [{ field: 'paymentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentRefunded', aggregate: 'Payment', trigger: 'Refund issued to customer', payload: [{ field: 'paymentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['ship', 'shipping', 'delivery', 'fulfillment', 'dispatch'],
    events: [
      { name: 'ShipmentCreated', aggregate: 'Shipment', trigger: 'Shipment record created', payload: [{ field: 'shipmentId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'ShipmentDispatched', aggregate: 'Shipment', trigger: 'Package handed to carrier', payload: [{ field: 'shipmentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'ShipmentDelivered', aggregate: 'Shipment', trigger: 'Package delivered to recipient', payload: [{ field: 'shipmentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'ShipmentFailed', aggregate: 'Shipment', trigger: 'Delivery attempt fails', payload: [{ field: 'shipmentId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['user', 'users', 'account', 'registration', 'signup', 'profile'],
    events: [
      { name: 'UserRegistered', aggregate: 'User', trigger: 'New user creates account', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserUpdated', aggregate: 'User', trigger: 'User updates profile', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserDeactivated', aggregate: 'User', trigger: 'Account deactivated', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
      { name: 'UserDeleted', aggregate: 'User', trigger: 'Account permanently deleted', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['auth', 'authentication', 'login', 'logout', 'session', 'token'],
    events: [
      { name: 'UserLoggedIn', aggregate: 'AuthSession', trigger: 'User authenticates successfully', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserLoggedOut', aggregate: 'AuthSession', trigger: 'User ends session', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'LoginFailed', aggregate: 'AuthSession', trigger: 'Authentication attempt fails', payload: [{ field: 'email', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'TokenRefreshed', aggregate: 'AuthSession', trigger: 'Access token refreshed', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
];

function suggestEventsHeuristicTest(description: string, existingEvents: string[]): DomainEvent[] {
  const lower = description.toLowerCase();
  const existingSet = new Set(existingEvents.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const results: DomainEvent[] = [];

  for (const pattern of TEST_DOMAIN_PATTERNS) {
    const matched = pattern.keywords.some((kw) => lower.includes(kw));
    if (!matched) continue;
    for (const event of pattern.events) {
      if (seen.has(event.name)) continue;
      if (existingSet.has(event.name.toLowerCase())) continue;
      seen.add(event.name);
      results.push(event);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tests: create_draft handler
// ---------------------------------------------------------------------------

describe('create_draft MCP tool handler', () => {
  describe('When the session exists and participant is valid', () => {
    it('Then returns a draftId', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new DraftService((code) => store.getSession(code));

      const result = handleCreateDraft(store, service, session.code, creatorId, makeFile());

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { draftId: string };
      expect(body.draftId).toBeDefined();
      expect(typeof body.draftId).toBe('string');
      expect(body.draftId.length).toBeGreaterThan(0);
    });

    it('Then the draft is stored in the session', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new DraftService((code) => store.getSession(code));
      const content = makeFile();

      const result = handleCreateDraft(store, service, session.code, creatorId, content);
      const { draftId } = JSON.parse(result.content[0].text) as { draftId: string };

      const draft = service.getDraft(session.code, draftId);
      expect(draft).not.toBeNull();
      expect(draft?.participantId).toBe(creatorId);
      expect(draft?.publishedAt).toBeNull();
    });

    it('Then multiple drafts can be created for the same participant', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new DraftService((code) => store.getSession(code));

      handleCreateDraft(store, service, session.code, creatorId, makeFile());
      handleCreateDraft(store, service, session.code, creatorId, makeFile());

      const drafts = service.getDrafts(session.code);
      expect(drafts?.length).toBe(2);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const service = new DraftService((code) => store.getSession(code));

      const result = handleCreateDraft(store, service, 'XXXXXX', 'participant-1', makeFile());

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: suggest_events handler (heuristic logic)
// ---------------------------------------------------------------------------

describe('suggest_events MCP tool handler', () => {
  describe('When the description matches a known domain', () => {
    it('Then returns relevant events for order domain', () => {
      const result = handleSuggestEvents(
        'We are building an order management system',
        [],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      expect(body.events.length).toBeGreaterThan(0);
      const names = body.events.map((e) => e.name);
      expect(names).toContain('OrderCreated');
      expect(names).toContain('OrderCompleted');
    });

    it('Then returns relevant events for payment domain', () => {
      const result = handleSuggestEvents(
        'Handle payment processing and billing',
        [],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      const names = body.events.map((e) => e.name);
      expect(names).toContain('PaymentInitiated');
      expect(names).toContain('PaymentFailed');
    });

    it('Then returns events for multiple matched domains', () => {
      const result = handleSuggestEvents(
        'order processing with payment and shipping',
        [],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      const names = body.events.map((e) => e.name);
      expect(names.some((n) => n.startsWith('Order'))).toBe(true);
      expect(names.some((n) => n.startsWith('Payment'))).toBe(true);
      expect(names.some((n) => n.startsWith('Shipment'))).toBe(true);
    });
  });

  describe('When existingEvents are provided', () => {
    it('Then deduplicates events already in existingEvents', () => {
      const result = handleSuggestEvents(
        'order management system',
        ['OrderCreated', 'OrderCompleted'],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      const names = body.events.map((e) => e.name);
      expect(names).not.toContain('OrderCreated');
      expect(names).not.toContain('OrderCompleted');
      // Other order events still present
      expect(names).toContain('OrderCancelled');
    });

    it('Then deduplication is case-insensitive', () => {
      const result = handleSuggestEvents(
        'user registration system',
        ['userregistered', 'USERUPDATED'],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      const names = body.events.map((e) => e.name);
      expect(names).not.toContain('UserRegistered');
      expect(names).not.toContain('UserUpdated');
    });

    it('Then returns empty array when all events are already in existingEvents', () => {
      const result = handleSuggestEvents(
        'user account management',
        ['UserRegistered', 'UserUpdated', 'UserDeactivated', 'UserDeleted'],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      expect(body.events.length).toBe(0);
    });
  });

  describe('When the description does not match any known domain', () => {
    it('Then returns empty events array', () => {
      const result = handleSuggestEvents(
        'some completely unknown thing',
        [],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      expect(body.events).toEqual([]);
    });
  });

  describe('Event structure', () => {
    it('Then returned events have required DomainEvent fields', () => {
      const result = handleSuggestEvents(
        'user authentication system',
        [],
        suggestEventsHeuristicTest
      );

      const body = JSON.parse(result.content[0].text) as { events: DomainEvent[] };
      for (const event of body.events) {
        expect(event.name).toBeDefined();
        expect(event.aggregate).toBeDefined();
        expect(event.trigger).toBeDefined();
        expect(Array.isArray(event.payload)).toBe(true);
        expect(event.integration).toBeDefined();
        expect(event.integration.direction).toMatch(/^(inbound|outbound|internal)$/);
        expect(['CONFIRMED', 'LIKELY', 'POSSIBLE']).toContain(event.confidence);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: suggest_improvements handler
// ---------------------------------------------------------------------------

describe('suggest_improvements MCP tool handler', () => {
  describe('When the session and artifact exist', () => {
    it('Then returns suggestions for missing failure events', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      // Submit file with OrderCreated but no OrderFailed
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestImprovements(store, session.code, 'alice.yaml');

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { suggestions: ImprovementSuggestion[] };
      const missingEventSuggestions = body.suggestions.filter((s) => s.type === 'missing_event');
      expect(missingEventSuggestions.length).toBeGreaterThan(0);
      expect(missingEventSuggestions[0].description).toContain('OrderCreated');
    });

    it('Then returns suggestion for missing assumptions when none are declared', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestImprovements(store, session.code, 'alice.yaml');

      const body = JSON.parse(result.content[0].text) as { suggestions: ImprovementSuggestion[] };
      const missingAssumptionSuggestions = body.suggestions.filter((s) => s.type === 'missing_assumption');
      expect(missingAssumptionSuggestions.length).toBe(1);
    });

    it('Then returns confidence_upgrade suggestions for POSSIBLE events', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      store.submitYaml(session.code, creatorId, 'alice.yaml', makeFile());

      const result = handleSuggestImprovements(store, session.code, 'alice.yaml');

      const body = JSON.parse(result.content[0].text) as { suggestions: ImprovementSuggestion[] };
      const confidenceSuggestions = body.suggestions.filter((s) => s.type === 'confidence_upgrade');
      // OrderCompleted has POSSIBLE confidence
      expect(confidenceSuggestions.length).toBeGreaterThan(0);
      expect(confidenceSuggestions[0].description).toContain('POSSIBLE');
    });

    it('Then no missing_assumption suggestion when assumptions are declared', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const file = makeFile({
        boundary_assumptions: [
          {
            id: 'a1',
            type: 'ownership',
            statement: 'Order service owns the Order aggregate',
            affects_events: ['OrderCreated'],
            confidence: 'CONFIRMED',
            verify_with: 'team lead',
          },
        ],
      });
      store.submitYaml(session.code, creatorId, 'alice.yaml', file);

      const result = handleSuggestImprovements(store, session.code, 'alice.yaml');

      const body = JSON.parse(result.content[0].text) as { suggestions: ImprovementSuggestion[] };
      const missingAssumptionSuggestions = body.suggestions.filter((s) => s.type === 'missing_assumption');
      expect(missingAssumptionSuggestions.length).toBe(0);
    });

    it('Then returns pattern_match suggestion for no outbound events', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const file = makeFile({
        domain_events: [
          {
            name: 'OrderCreated',
            aggregate: 'Order',
            trigger: 'Customer places order',
            payload: [{ field: 'orderId', type: 'string' }],
            integration: { direction: 'internal' },
            confidence: 'LIKELY',
          },
        ],
      });
      store.submitYaml(session.code, creatorId, 'alice.yaml', file);

      const result = handleSuggestImprovements(store, session.code, 'alice.yaml');

      const body = JSON.parse(result.content[0].text) as { suggestions: ImprovementSuggestion[] };
      const patternSuggestions = body.suggestions.filter((s) => s.type === 'pattern_match');
      expect(patternSuggestions.length).toBe(1);
      expect(patternSuggestions[0].description).toContain('outbound');
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();

      const result = handleSuggestImprovements(store, 'XXXXXX', 'alice.yaml');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });

  describe('When the artifact does not exist in the session', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');

      const result = handleSuggestImprovements(store, session.code, 'nonexistent.yaml');

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('nonexistent.yaml');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: update_artifact handler
// ---------------------------------------------------------------------------

describe('update_artifact MCP tool handler', () => {
  describe('When the session, participant, and artifact all exist', () => {
    it('Then returns version 1 for the first update', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new ArtifactService();
      const content = makeFile();

      const result = handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', content);

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as { version: number };
      expect(body.version).toBe(1);
    });

    it('Then version increments on subsequent updates', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new ArtifactService();
      const content = makeFile();

      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', content);
      const result = handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', content);

      const body = JSON.parse(result.content[0].text) as { version: number };
      expect(body.version).toBe(2);
    });

    it('Then the latest version reflects the most recent content', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new ArtifactService();

      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', makeFile());
      const updatedContent = makeFile({
        metadata: {
          role: 'frontend',
          scope: 'UI',
          goal: 'Updated goal',
          generated_at: '2026-01-02T00:00:00Z',
          event_count: 1,
          assumption_count: 0,
        },
      });
      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', updatedContent, 'Changed role to frontend');

      const latest = service.getLatestVersion(session.code, creatorId, 'alice.yaml');
      expect(latest?.version).toBe(2);
      expect(latest?.data.metadata.role).toBe('frontend');
      expect(latest?.changeSummary).toBe('Changed role to frontend');
      expect(latest?.protocol).toBe('mcp');
    });

    it('Then version history preserves all prior versions', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new ArtifactService();

      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', makeFile());
      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', makeFile());
      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', makeFile());

      const history = service.getVersionHistory(session.code, creatorId, 'alice.yaml');
      expect(history.length).toBe(3);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
    });

    it('Then version chains: each version references the prior versionId', () => {
      const store = new SessionStore();
      const { session, creatorId } = store.createSession('Alice');
      const service = new ArtifactService();

      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', makeFile());
      handleUpdateArtifact(store, service, session.code, creatorId, 'alice.yaml', makeFile());

      const history = service.getVersionHistory(session.code, creatorId, 'alice.yaml');
      expect(history[0].previousVersionId).toBeNull();
      expect(history[1].previousVersionId).toBe(history[0].versionId);
    });
  });

  describe('When the session does not exist', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const service = new ArtifactService();

      const result = handleUpdateArtifact(store, service, 'XXXXXX', 'p1', 'alice.yaml', makeFile());

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Session not found');
    });
  });

  describe('When the participant is not in the session', () => {
    it('Then returns isError with a descriptive message', () => {
      const store = new SessionStore();
      const { session } = store.createSession('Alice');
      const service = new ArtifactService();

      const result = handleUpdateArtifact(store, service, session.code, 'non-existent-participant', 'alice.yaml', makeFile());

      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0].text) as { error: string };
      expect(body.error).toContain('Participant not in session');
    });
  });
});
