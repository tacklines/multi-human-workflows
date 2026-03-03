import type { DomainEvent, BoundaryAssumption, Confidence } from '../schema/types.js';
import { DOMAIN_PATTERNS } from './event-suggestions.js';

// ---------------------------------------------------------------------------
// Requirement-to-event derivation engine — parses natural-language
// requirements into domain events and boundary assumptions.
//
// Pure function module: no DOM, no store, no side effects.
// ---------------------------------------------------------------------------

export interface DerivationResult {
  requirementId: string;
  events: DomainEvent[];
  assumptions: BoundaryAssumption[];
}

// ---------------------------------------------------------------------------
// Verb-noun extraction
// ---------------------------------------------------------------------------

/** Common verbs that map to event lifecycle suffixes */
const VERB_TO_SUFFIX: Record<string, string[]> = {
  create: ['Created'],
  add: ['Added'],
  register: ['Registered'],
  submit: ['Submitted'],
  delete: ['Deleted'],
  remove: ['Removed'],
  update: ['Updated'],
  edit: ['Updated'],
  modify: ['Updated'],
  change: ['Changed'],
  cancel: ['Cancelled'],
  approve: ['Approved'],
  reject: ['Rejected'],
  send: ['Sent'],
  receive: ['Received'],
  upload: ['Uploaded'],
  download: ['Downloaded'],
  share: ['Shared', 'SharePermissionGranted', 'ShareRevoked'],
  sync: ['SyncRequested', 'SyncCompleted', 'SyncFailed'],
  import: ['Imported'],
  export: ['Exported'],
  publish: ['Published'],
  archive: ['Archived'],
  assign: ['Assigned'],
  transfer: ['Transferred'],
  validate: ['Validated', 'ValidationFailed'],
  verify: ['Verified', 'VerificationFailed'],
  process: ['ProcessingStarted', 'ProcessingCompleted', 'ProcessingFailed'],
};

/** Nouns that expand into lifecycle event sets */
const NOUN_LIFECYCLE_EVENTS: Record<string, string[]> = {
  offline: ['OfflineModeEnabled', 'OfflineSyncRequested', 'OfflineSyncCompleted', 'OfflineConflictDetected'],
  notification: ['NotificationSent', 'NotificationPreferenceSet', 'NotificationDelivered', 'NotificationFailed'],
  notifications: ['NotificationSent', 'NotificationPreferenceSet', 'NotificationDelivered', 'NotificationFailed'],
  cache: ['CachePopulated', 'CacheInvalidated', 'CacheHit', 'CacheMiss'],
  search: ['SearchRequested', 'SearchCompleted', 'SearchIndexUpdated'],
  subscription: ['SubscriptionCreated', 'SubscriptionRenewed', 'SubscriptionCancelled', 'SubscriptionExpired'],
  workflow: ['WorkflowStarted', 'WorkflowStepCompleted', 'WorkflowCompleted', 'WorkflowFailed'],
};

/** Words to ignore during extraction */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'we', 'they', 'it', 'i', 'you', 'he', 'she', 'that', 'this',
  'and', 'or', 'but', 'not', 'no', 'so', 'if', 'when', 'then',
  'able', 'allow', 'support', 'want', 'like', 'our', 'their',
  'also', 'about', 'into', 'through', 'which', 'where', 'how',
  'real-time', 'real', 'time',
]);

/** Integration keywords that generate boundary assumptions */
const INTEGRATION_KEYWORDS: Record<string, { type: BoundaryAssumption['type']; template: string }> = {
  stripe: { type: 'contract', template: 'Payment processing is handled by Stripe' },
  paypal: { type: 'contract', template: 'Payment processing is handled by PayPal' },
  twilio: { type: 'contract', template: 'SMS/messaging is handled by Twilio' },
  sendgrid: { type: 'contract', template: 'Email delivery is handled by SendGrid' },
  aws: { type: 'contract', template: 'Cloud infrastructure is provided by AWS' },
  firebase: { type: 'contract', template: 'Backend services are provided by Firebase' },
  salesforce: { type: 'contract', template: 'CRM integration uses Salesforce API' },
};

/** Concept keywords that generate boundary assumptions */
const CONCEPT_ASSUMPTIONS: Record<string, { type: BoundaryAssumption['type']; statement: string }> = {
  notification: { type: 'existence', statement: 'Notification delivery system exists and is reachable' },
  notifications: { type: 'existence', statement: 'Notification delivery system exists and is reachable' },
  email: { type: 'existence', statement: 'Email delivery service exists and is configured' },
  sms: { type: 'existence', statement: 'SMS gateway exists and is configured' },
  offline: { type: 'ownership', statement: 'Server handles conflict resolution for offline sync' },
  sync: { type: 'ownership', statement: 'Server handles conflict resolution for data synchronization' },
  integrate: { type: 'contract', statement: 'External system API contract is stable and documented' },
  integration: { type: 'contract', statement: 'External system API contract is stable and documented' },
  webhook: { type: 'contract', statement: 'Webhook endpoint contract is defined and versioned' },
  api: { type: 'contract', statement: 'External API contract is stable and documented' },
};

// ---------------------------------------------------------------------------
// PascalCase conversion
// ---------------------------------------------------------------------------

function toPascalCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies')) return lower.slice(0, -3) + 'y';
  if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes')) return lower.slice(0, -2);
  if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
  return lower;
}

// ---------------------------------------------------------------------------
// Explicit event name detection (e.g., "we need a WidgetCreated event")
// ---------------------------------------------------------------------------

const EXPLICIT_EVENT_REGEX = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

function extractExplicitEvents(statement: string): string[] {
  const matches = statement.match(EXPLICIT_EVENT_REGEX);
  if (!matches) return [];
  // Filter to likely event names (end with past tense or lifecycle suffix)
  const suffixes = [
    'Created', 'Updated', 'Deleted', 'Removed', 'Started', 'Completed',
    'Failed', 'Cancelled', 'Approved', 'Rejected', 'Sent', 'Received',
    'Initiated', 'Registered', 'Submitted', 'Published', 'Archived',
    'Enabled', 'Disabled', 'Requested', 'Granted', 'Revoked',
    'Assigned', 'Transferred', 'Validated', 'Verified', 'Expired',
    'Shared', 'Uploaded', 'Downloaded', 'Imported', 'Exported',
    'Changed', 'Added', 'Renewed',
  ];
  return matches.filter((m) => suffixes.some((s) => m.endsWith(s)));
}

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

function tokenize(statement: string): string[] {
  return statement
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function makeDomainEvent(
  name: string,
  aggregate: string,
  trigger: string,
  confidence: Confidence,
  requirementId: string,
): DomainEvent {
  return {
    name,
    aggregate,
    trigger,
    payload: [{ field: `${aggregate.toLowerCase()}Id`, type: 'string' }],
    integration: { direction: 'internal' },
    confidence,
    sourceRequirements: [requirementId],
  };
}

let assumptionCounter = 0;

function makeAssumption(
  type: BoundaryAssumption['type'],
  statement: string,
  affectsEvents: string[],
): BoundaryAssumption {
  assumptionCounter += 1;
  return {
    id: `ba-derived-${assumptionCounter}`,
    type,
    statement,
    affects_events: affectsEvents,
    confidence: 'POSSIBLE',
    verify_with: 'team',
  };
}

/**
 * Derive domain events and boundary assumptions from a single
 * natural-language requirement.
 */
export function deriveFromRequirement(
  requirementId: string,
  statement: string,
  existingEvents: string[],
): DerivationResult {
  const trimmed = statement.trim();
  if (!trimmed) {
    return { requirementId, events: [], assumptions: [] };
  }

  const existingSet = new Set(existingEvents.map((e) => e.toLowerCase()));
  const seenNames = new Set<string>();
  const events: DomainEvent[] = [];
  const assumptions: BoundaryAssumption[] = [];
  const seenAssumptions = new Set<string>();

  const addEvent = (event: DomainEvent): boolean => {
    const key = event.name.toLowerCase();
    if (seenNames.has(key) || existingSet.has(key)) return false;
    seenNames.add(key);
    events.push(event);
    return true;
  };

  const addAssumption = (
    type: BoundaryAssumption['type'],
    stmt: string,
    affectsEvents: string[],
  ): void => {
    if (seenAssumptions.has(stmt)) return;
    seenAssumptions.add(stmt);
    assumptions.push(makeAssumption(type, stmt, affectsEvents));
  };

  const tokens = tokenize(trimmed);
  const lower = trimmed.toLowerCase();

  // Phase 1: Explicit event names (CONFIRMED confidence)
  const explicitNames = extractExplicitEvents(trimmed);
  for (const name of explicitNames) {
    // Derive aggregate from the event name (everything before the last suffix word)
    const parts = name.match(/[A-Z][a-z]+/g) || [];
    const aggregate = parts.length > 1 ? parts.slice(0, -1).join('') : parts[0] || 'Unknown';
    addEvent(makeDomainEvent(name, aggregate, `Explicitly stated in requirement`, 'CONFIRMED', requirementId));
  }

  // Phase 2: Domain pattern matching (LIKELY confidence)
  for (const pattern of DOMAIN_PATTERNS) {
    const matched = pattern.keywords.some((kw) => lower.includes(kw));
    if (!matched) continue;
    for (const event of pattern.events) {
      const enriched: DomainEvent = {
        ...event,
        sourceRequirements: [requirementId],
      };
      addEvent(enriched);
    }
  }

  // Phase 3: Noun lifecycle events (POSSIBLE confidence)
  for (const token of tokens) {
    const lifecycle = NOUN_LIFECYCLE_EVENTS[token];
    if (!lifecycle) continue;
    const aggregate = toPascalCase(singularize(token));
    for (const eventName of lifecycle) {
      addEvent(
        makeDomainEvent(eventName, aggregate, `Derived from "${token}" in requirement`, 'POSSIBLE', requirementId),
      );
    }
  }

  // Phase 4: Verb-noun extraction (POSSIBLE confidence)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const suffixes = VERB_TO_SUFFIX[token];
    if (!suffixes) continue;

    // Find the next non-stop-word as the noun
    for (let j = i + 1; j < tokens.length; j++) {
      const candidate = tokens[j];
      if (STOP_WORDS.has(candidate)) continue;
      // Skip verbs that are also in our verb map
      if (VERB_TO_SUFFIX[candidate]) continue;
      // Skip if it's a lifecycle noun (handled in phase 3)
      if (NOUN_LIFECYCLE_EVENTS[candidate]) break;

      const noun = toPascalCase(singularize(candidate));
      const aggregate = noun;

      for (const suffix of suffixes) {
        // If suffix already contains the noun concept (e.g., SharePermissionGranted), use as-is
        if (suffix.includes(noun) || suffix.length > 15) {
          addEvent(
            makeDomainEvent(suffix, aggregate, `Derived from "${token} ${candidate}"`, 'POSSIBLE', requirementId),
          );
        } else {
          const eventName = `${noun}${suffix}`;
          addEvent(
            makeDomainEvent(eventName, aggregate, `Derived from "${token} ${candidate}"`, 'POSSIBLE', requirementId),
          );
        }
      }
      break; // Only match the first noun after the verb
    }
  }

  // Phase 5: Boundary assumptions
  // Integration-specific assumptions
  for (const [keyword, config] of Object.entries(INTEGRATION_KEYWORDS)) {
    if (lower.includes(keyword)) {
      const relatedEvents = events.map((e) => e.name);
      addAssumption(config.type, config.template, relatedEvents);
    }
  }

  // Concept-based assumptions
  for (const token of tokens) {
    const config = CONCEPT_ASSUMPTIONS[token];
    if (!config) continue;
    const relatedEvents = events.map((e) => e.name);
    addAssumption(config.type, config.statement, relatedEvents);
  }

  return { requirementId, events, assumptions };
}

/**
 * Derive events from multiple requirements, accumulating existing events
 * across iterations so later requirements don't duplicate earlier ones.
 */
export function deriveFromRequirements(
  requirements: Array<{ id: string; statement: string }>,
  existingEvents: string[],
): DerivationResult[] {
  const accumulated = [...existingEvents];
  const results: DerivationResult[] = [];

  for (const req of requirements) {
    const result = deriveFromRequirement(req.id, req.statement, accumulated);
    results.push(result);
    // Add newly derived event names to the accumulator
    for (const event of result.events) {
      accumulated.push(event.name);
    }
  }

  return results;
}
