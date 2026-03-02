import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { sessionStore } from './store.js';
import { parseAndValidate } from '../lib/yaml-validator-server.js';
import { computePrepStatus, computeSessionStatus } from '../lib/prep-completeness.js';
import { computeWorkflowStatus } from '../lib/workflow-engine.js';
import { serializeSession } from '../lib/session-store.js';
import { compareFiles } from '../lib/comparison.js';
import { DraftService } from '../contexts/draft/draft-service.js';
import { ArtifactService } from '../contexts/artifact/artifact-service.js';
import type { DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// CLI arg parsing for scoped mode: --session=CODE --user=NAME
// ---------------------------------------------------------------------------

function parseArgs(): { session?: string; user?: string } {
  const args = process.argv.slice(2);
  const result: { session?: string; user?: string } = {};
  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (key === '--session' && value) result.session = value.toUpperCase();
    if (key === '--user' && value) result.user = value;
  }
  return result;
}

// Scoped context — populated on startup when --session/--user are provided
interface ScopedContext {
  sessionCode: string;
  participantId: string;
  participantName: string;
}

// ---------------------------------------------------------------------------
// Module-level service instances
// ---------------------------------------------------------------------------

const draftService = new DraftService((code) => sessionStore.getSession(code));
const artifactService = new ArtifactService();

// ---------------------------------------------------------------------------
// suggest_events heuristic — maps domain keywords to standard event patterns
// ---------------------------------------------------------------------------

interface DomainPattern {
  keywords: string[];
  events: Array<Omit<DomainEvent, 'name'> & { name: string }>;
}

const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    keywords: ['order', 'orders', 'ordering', 'purchase'],
    events: [
      { name: 'OrderCreated', aggregate: 'Order', trigger: 'Customer places order', payload: [{ field: 'orderId', type: 'string' }, { field: 'customerId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderUpdated', aggregate: 'Order', trigger: 'Customer modifies order', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderCancelled', aggregate: 'Order', trigger: 'Customer or system cancels order', payload: [{ field: 'orderId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderCompleted', aggregate: 'Order', trigger: 'Order fulfillment complete', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'OrderFailed', aggregate: 'Order', trigger: 'Order processing fails', payload: [{ field: 'orderId', type: 'string' }, { field: 'error', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['payment', 'payments', 'billing', 'invoice', 'charge'],
    events: [
      { name: 'PaymentInitiated', aggregate: 'Payment', trigger: 'Payment process starts', payload: [{ field: 'paymentId', type: 'string' }, { field: 'amount', type: 'number' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentCompleted', aggregate: 'Payment', trigger: 'Payment successfully processed', payload: [{ field: 'paymentId', type: 'string' }, { field: 'transactionId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentFailed', aggregate: 'Payment', trigger: 'Payment processing fails', payload: [{ field: 'paymentId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentRefunded', aggregate: 'Payment', trigger: 'Refund issued to customer', payload: [{ field: 'paymentId', type: 'string' }, { field: 'amount', type: 'number' }], integration: { direction: 'outbound' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['ship', 'shipping', 'delivery', 'fulfillment', 'dispatch'],
    events: [
      { name: 'ShipmentCreated', aggregate: 'Shipment', trigger: 'Shipment record created', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'ShipmentDispatched', aggregate: 'Shipment', trigger: 'Package handed to carrier', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'trackingNumber', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'ShipmentDelivered', aggregate: 'Shipment', trigger: 'Package delivered to recipient', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'deliveredAt', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'ShipmentFailed', aggregate: 'Shipment', trigger: 'Delivery attempt fails', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['user', 'users', 'account', 'registration', 'signup', 'profile'],
    events: [
      { name: 'UserRegistered', aggregate: 'User', trigger: 'New user creates account', payload: [{ field: 'userId', type: 'string' }, { field: 'email', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserUpdated', aggregate: 'User', trigger: 'User updates profile', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserDeactivated', aggregate: 'User', trigger: 'Account deactivated', payload: [{ field: 'userId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
      { name: 'UserDeleted', aggregate: 'User', trigger: 'Account permanently deleted', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['auth', 'authentication', 'login', 'logout', 'session', 'token'],
    events: [
      { name: 'UserLoggedIn', aggregate: 'AuthSession', trigger: 'User authenticates successfully', payload: [{ field: 'userId', type: 'string' }, { field: 'sessionToken', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserLoggedOut', aggregate: 'AuthSession', trigger: 'User ends session', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'LoginFailed', aggregate: 'AuthSession', trigger: 'Authentication attempt fails', payload: [{ field: 'email', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'TokenRefreshed', aggregate: 'AuthSession', trigger: 'Access token refreshed', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
];

/**
 * Generate candidate domain events from a natural-language description.
 * Matches known domain keywords and filters out events already in existingEvents.
 */
function suggestEventsHeuristic(description: string, existingEvents: string[]): DomainEvent[] {
  const lower = description.toLowerCase();
  const existingSet = new Set(existingEvents.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const results: DomainEvent[] = [];

  for (const pattern of DOMAIN_PATTERNS) {
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

/**
 * Analyze an artifact and generate improvement suggestions.
 */
interface ImprovementSuggestion {
  type: 'missing_event' | 'missing_assumption' | 'confidence_upgrade' | 'pattern_match';
  description: string;
  suggestedContent?: Partial<DomainEvent>;
}

function suggestImprovementsForFile(file: import('../schema/types.js').CandidateEventsFile): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];
  const status = computePrepStatus(file);

  // Missing failure events: if command-like events exist but no failure counterpart
  const eventNames = file.domain_events.map((e) => e.name);
  const commandEvents = eventNames.filter((n) =>
    /Created|Updated|Submitted|Initiated|Approved|Placed/i.test(n)
  );
  for (const cmd of commandEvents) {
    const base = cmd.replace(/Created|Updated|Submitted|Initiated|Approved|Placed/i, '');
    const hasFailed = eventNames.some((n) => n.toLowerCase().includes(base.toLowerCase() + 'fail') || n.toLowerCase().includes('failed'));
    if (!hasFailed) {
      suggestions.push({
        type: 'missing_event',
        description: `Consider adding a failure event for "${cmd}" — e.g., "${base}Failed"`,
        suggestedContent: {
          name: `${base}Failed`,
          aggregate: file.domain_events.find((e) => e.name === cmd)?.aggregate ?? base,
          trigger: `${cmd} processing fails`,
          payload: [{ field: 'reason', type: 'string' }],
          integration: { direction: 'internal' },
          confidence: 'POSSIBLE',
        },
      });
    }
  }

  // Missing assumptions
  if (status.assumptionCount === 0) {
    suggestions.push({
      type: 'missing_assumption',
      description: 'No boundary assumptions declared — add at least one to clarify service ownership or external dependencies',
    });
  }

  // Confidence upgrades: POSSIBLE events that could be LIKELY
  const possibleEvents = file.domain_events.filter((e) => e.confidence === 'POSSIBLE');
  for (const event of possibleEvents) {
    suggestions.push({
      type: 'confidence_upgrade',
      description: `"${event.name}" is POSSIBLE — if there is stakeholder evidence, upgrade to LIKELY`,
      suggestedContent: { name: event.name, confidence: 'LIKELY' },
    });
  }

  // Pattern match: if no outbound events, suggest integration
  if (status.directionBreakdown['outbound'] === 0 && status.eventCount > 0) {
    suggestions.push({
      type: 'pattern_match',
      description: 'No outbound events found — consider which events are emitted to other bounded contexts',
    });
  }

  return suggestions;
}

async function main(): Promise<void> {
  const cliArgs = parseArgs();
  let scoped: ScopedContext | null = null;

  // If --session and --user provided, auto-join (or reconnect) on startup
  if (cliArgs.session && cliArgs.user) {
    const session = sessionStore.getSession(cliArgs.session);
    if (!session) {
      console.error(`[mcp] session ${cliArgs.session} not found`);
      process.exit(1);
    }

    // Check if user already exists in session (reconnect)
    let existingId: string | null = null;
    for (const [id, p] of session.participants) {
      if (p.name === cliArgs.user) {
        existingId = id;
        break;
      }
    }

    if (existingId) {
      scoped = {
        sessionCode: cliArgs.session,
        participantId: existingId,
        participantName: cliArgs.user,
      };
      console.error(`[mcp] reconnected as "${cliArgs.user}" (${existingId}) in session ${cliArgs.session}`);
    } else {
      const result = sessionStore.joinSession(cliArgs.session, cliArgs.user);
      if (!result) {
        console.error(`[mcp] failed to join session ${cliArgs.session}`);
        process.exit(1);
      }
      scoped = {
        sessionCode: cliArgs.session,
        participantId: result.participantId,
        participantName: cliArgs.user,
      };
      console.error(`[mcp] joined session ${cliArgs.session} as "${cliArgs.user}" (${result.participantId})`);
    }
  }

  const serverName = scoped
    ? `multi-human-workflows (${scoped.participantName}@${scoped.sessionCode})`
    : 'multi-human-workflows';

  const server = new McpServer({
    name: serverName,
    version: '0.1.0',
  });

  // Tool: create_session
  server.registerTool(
    'create_session',
    {
      description: 'Create a new collaborative session and get the join code',
      inputSchema: {
        creatorName: z.string().describe('Name of the session creator'),
      },
    },
    ({ creatorName }) => {
      const { session, creatorId } = sessionStore.createSession(creatorName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ code: session.code, participantId: creatorId }),
          },
        ],
      };
    }
  );

  // Tool: join_session
  server.registerTool(
    'join_session',
    {
      description: 'Join an existing session by its code',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantName: z.string().describe('Name of the participant joining'),
      },
    },
    ({ code, participantName }) => {
      const result = sessionStore.joinSession(code, participantName);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              participantId: result.participantId,
              participants: result.session.participants,
            }),
          },
        ],
      };
    }
  );

  // Tool: submit_artifact
  server.registerTool(
    'submit_artifact',
    {
      description: 'Parse, validate, and submit a YAML file to the session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID from create_session or join_session'),
        fileName: z.string().describe('File name for the YAML submission'),
        yamlContent: z.string().describe('Raw YAML string to parse and validate'),
      },
    },
    ({ code, participantId, fileName, yamlContent }) => {
      const outcome = parseAndValidate(fileName, yamlContent);
      if (!outcome.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'YAML validation failed', errors: outcome.errors }),
            },
          ],
          isError: true,
        };
      }

      const submission = sessionStore.submitYaml(code, participantId, fileName, outcome.file.data);
      if (!submission) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found or participant not in session' }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, submittedAt: submission.submittedAt }),
          },
        ],
      };
    }
  );

  // Tool: get_session
  server.registerTool(
    'get_session',
    {
      description: 'Get the current state of a session including participants and submissions',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found' }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ session }),
          },
        ],
      };
    }
  );

  // Tool: query_prep_status
  server.registerTool(
    'query_prep_status',
    {
      description:
        'Get completeness analysis for a session — event counts, confidence breakdown, gaps, and a 0-100 score per file and overall',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const files = sessionStore.getSessionFiles(code);
      if (files.length === 0) {
        const session = sessionStore.getSession(code);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ message: 'No submissions yet', participantCount: session.participants.size }),
            },
          ],
        };
      }
      const status = computeSessionStatus(files);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status) }],
      };
    }
  );

  // Tool: start_jam
  server.registerTool(
    'start_jam',
    {
      description: 'Start a jam session for collaborative conflict resolution. Must be called before record_resolution/assign_ownership/flag_unresolved tools.',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const jam = sessionStore.startJam(code);
      if (!jam) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, jam }) }],
      };
    }
  );

  // Tool: record_resolution
  server.registerTool(
    'record_resolution',
    {
      description: 'Record a conflict resolution decision in the jam session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        overlapLabel: z.string().describe('Label of the overlap being resolved (from comparison)'),
        resolution: z.string().describe('Description of how the conflict was resolved'),
        chosenApproach: z.string().describe('Which approach was chosen (e.g., "merge", role name, or custom)'),
        resolvedBy: z.array(z.string()).describe('Names of participants who agreed to this resolution'),
      },
    },
    ({ code, overlapLabel, resolution, chosenApproach, resolvedBy }) => {
      const result = sessionStore.resolveConflict(code, { overlapLabel, resolution, chosenApproach, resolvedBy });
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, resolution: result }) }],
      };
    }
  );

  // Tool: assign_ownership
  server.registerTool(
    'assign_ownership',
    {
      description: 'Assign aggregate ownership to a role in the jam session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        aggregate: z.string().describe('Name of the aggregate'),
        ownerRole: z.string().describe('Role that owns this aggregate'),
        assignedBy: z.string().describe('Name of participant making the assignment'),
      },
    },
    ({ code, aggregate, ownerRole, assignedBy }) => {
      const result = sessionStore.assignOwnership(code, { aggregate, ownerRole, assignedBy });
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, assignment: result }) }],
      };
    }
  );

  // Tool: flag_unresolved
  server.registerTool(
    'flag_unresolved',
    {
      description: 'Flag an unresolved item in the jam session for later follow-up',
      inputSchema: {
        code: z.string().describe('Session join code'),
        description: z.string().describe('Description of the unresolved item'),
        flaggedBy: z.string().describe('Name of the participant flagging this item'),
        relatedOverlap: z.string().optional().describe('Label of a related overlap, if any'),
      },
    },
    ({ code, description, flaggedBy, relatedOverlap }) => {
      const item = relatedOverlap
        ? { description, flaggedBy, relatedOverlap }
        : { description, flaggedBy };
      const result = sessionStore.flagUnresolved(code, item);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, flagged: result }) }],
      };
    }
  );

  // Tool: export_jam_artifacts
  server.registerTool(
    'export_jam_artifacts',
    {
      description: 'Export all jam session artifacts (resolutions, ownership map, unresolved items)',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const jam = sessionStore.exportJam(code);
      if (!jam) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(jam) }],
      };
    }
  );

  // Tool: load_prep_artifact
  server.registerTool(
    'load_prep_artifact',
    {
      description:
        'Submit a YAML file directly to a session (parse + validate + submit in one step). Returns completeness analysis of the submitted file.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID from create_session or join_session'),
        fileName: z.string().describe('File name for the submission'),
        yamlContent: z.string().describe('Raw YAML string to parse and validate'),
      },
    },
    ({ code, participantId, fileName, yamlContent }) => {
      const outcome = parseAndValidate(fileName, yamlContent);
      if (!outcome.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'YAML validation failed', errors: outcome.errors }),
            },
          ],
          isError: true,
        };
      }

      const submission = sessionStore.submitYaml(code, participantId, fileName, outcome.file.data);
      if (!submission) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found or participant not in session' }),
            },
          ],
          isError: true,
        };
      }

      const prepStatus = computePrepStatus(outcome.file.data);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              submittedAt: submission.submittedAt,
              completeness: prepStatus,
            }),
          },
        ],
      };
    }
  );

  // Tool: load_contracts
  server.registerTool(
    'load_contracts',
    {
      description: 'Load a contract bundle (from /formalize output) into the session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        bundle: z.string().describe('JSON string of the ContractBundle'),
      },
    },
    ({ code, bundle }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bundle);
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid JSON' }) }],
          isError: true,
        };
      }
      const result = sessionStore.loadContracts(code, parsed as import('../schema/types.js').ContractBundle);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, eventContracts: result.eventContracts.length, boundaryContracts: result.boundaryContracts.length }) }],
      };
    }
  );

  // Tool: diff_contracts
  server.registerTool(
    'diff_contracts',
    {
      description: 'Compare loaded contracts against the original prep submissions to show what changed',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const contracts = sessionStore.getContracts(code);
      const files = sessionStore.getSessionFiles(code);
      if (!contracts) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No contracts loaded' }) }],
          isError: true,
        };
      }
      // Diff: events in contracts vs events in submissions
      const contractEventNames = new Set(contracts.eventContracts.map((c) => c.eventName));
      const prepEventNames = new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name)));
      const added = [...contractEventNames].filter((n) => !prepEventNames.has(n));
      const removed = [...prepEventNames].filter((n) => !contractEventNames.has(n));
      const retained = [...contractEventNames].filter((n) => prepEventNames.has(n));
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ added, removed, retained, totalContracts: contracts.eventContracts.length, totalPrepEvents: prepEventNames.size }),
        }],
      };
    }
  );

  // Tool: load_integration_report
  server.registerTool(
    'load_integration_report',
    {
      description: 'Load an integration report (from /integrate output) into the session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        report: z.string().describe('JSON string of the IntegrationReport'),
      },
    },
    ({ code, report }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(report);
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid JSON' }) }],
          isError: true,
        };
      }
      const result = sessionStore.loadIntegrationReport(code, parsed as import('../schema/types.js').IntegrationReport);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, overallStatus: result.overallStatus, checkCount: result.checks.length }) }],
      };
    }
  );

  // Tool: query_integration_status
  server.registerTool(
    'query_integration_status',
    {
      description: 'Get the integration report status for a session — checks, overall status, and go/no-go assessment',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const report = sessionStore.getIntegrationReport(code);
      if (!report) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No integration report loaded' }) }],
          isError: true,
        };
      }
      const passCount = report.checks.filter((c) => c.status === 'pass').length;
      const failCount = report.checks.filter((c) => c.status === 'fail').length;
      const warnCount = report.checks.filter((c) => c.status === 'warn').length;
      const goNoGo = failCount === 0 ? 'GO' : 'NO-GO';
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            overallStatus: report.overallStatus,
            goNoGo,
            summary: report.summary,
            checks: { pass: passCount, fail: failCount, warn: warnCount, total: report.checks.length },
            details: report.checks,
          }),
        }],
      };
    }
  );

  // Tool: query_workflow_phase
  server.registerTool(
    'query_workflow_phase',
    {
      description:
        'Get the current workflow phase, all phase statuses, artifact inventory, and suggested next action for a session',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const status = computeWorkflowStatus({
        participantCount: session.participants.size,
        submissionCount: session.submissions.length,
        jam: session.jam,
        contracts: session.contracts,
        integrationReport: session.integrationReport,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status) }],
      };
    }
  );

  // Tool: poll_workflow_phase
  server.registerTool(
    'poll_workflow_phase',
    {
      description:
        'Poll for workflow phase changes. Call without `since` to get the current phase and a lastChecked timestamp. ' +
        'Call again with the returned lastChecked value to detect whether the phase has changed since your last poll.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        since: z.string().optional().describe('ISO timestamp from a prior lastChecked value; if provided, a `changed` boolean is included in the response'),
      },
    },
    ({ code, since }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const status = computeWorkflowStatus({
        participantCount: session.participants.size,
        submissionCount: session.submissions.length,
        jam: session.jam,
        contracts: session.contracts,
        integrationReport: session.integrationReport,
      });
      const lastChecked = new Date().toISOString();
      const response: Record<string, unknown> = {
        ...status,
        lastChecked,
      };
      if (since !== undefined) {
        // Determine whether any phase has changed by comparing artifact counts.
        // Since computeWorkflowStatus is deterministic, we detect change by checking
        // whether the currentPhase differs from what the caller last saw. Callers
        // should compare the returned currentPhase against their stored value to act
        // on changes. The `changed` flag here indicates whether the session had any
        // meaningful activity since `since` — we use the lastChecked timestamp itself
        // as a proxy: if since < the creation of this response, we can only confirm
        // the phase at poll time. The caller is responsible for comparing currentPhase.
        const sinceDate = new Date(since);
        const isValidDate = !isNaN(sinceDate.getTime());
        response['changed'] = isValidDate ? new Date(lastChecked) > sinceDate : true;
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      };
    }
  );

  // Tool: compare_artifacts
  server.registerTool(
    'compare_artifacts',
    {
      description:
        'Compare submitted artifacts across participants — returns overlapping events, aggregate conflicts, and assumption conflicts without requiring a full prep status query',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const files = sessionStore.getSessionFiles(code);
      if (files.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ overlaps: [], message: 'No submissions yet' }) }],
        };
      }
      const overlaps = compareFiles(files);
      const byKind: Record<string, typeof overlaps> = {};
      for (const o of overlaps) {
        (byKind[o.kind] ??= []).push(o);
      }
      const uniquePerFile: Record<string, string[]> = {};
      for (const f of files) {
        const eventNames = f.data.domain_events.map((e) => e.name);
        const others = files.filter((g) => g.filename !== f.filename).flatMap((g) => g.data.domain_events.map((e) => e.name));
        uniquePerFile[f.role] = eventNames.filter((n) => !others.includes(n));
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            overlapCount: overlaps.length,
            overlaps,
            byKind,
            uniquePerFile,
          }),
        }],
      };
    }
  );

  // Tool: check_compliance
  server.registerTool(
    'check_compliance',
    {
      description:
        'Validate current session state against loaded contracts — checks whether contracts are loaded, whether all prep events are covered, and returns integration report status if available',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const contracts = sessionStore.getContracts(code);
      if (!contracts) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              compliant: false,
              reason: 'No contracts loaded — run contract_load first',
              contractsLoaded: false,
            }),
          }],
        };
      }
      const files = sessionStore.getSessionFiles(code);
      const contractEventNames = new Set(contracts.eventContracts.map((c) => c.eventName));
      const prepEventNames = new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name)));
      const uncovered = [...prepEventNames].filter((n) => !contractEventNames.has(n));
      const missing = [...contractEventNames].filter((n) => !prepEventNames.has(n));
      const report = sessionStore.getIntegrationReport(code);
      const result: Record<string, unknown> = {
        contractsLoaded: true,
        eventContractCount: contracts.eventContracts.length,
        boundaryContractCount: contracts.boundaryContracts.length,
        prepEventCount: prepEventNames.size,
        uncoveredPrepEvents: uncovered,
        contractEventsNotInPrep: missing,
        compliant: uncovered.length === 0 && missing.length === 0,
      };
      if (report) {
        const failCount = report.checks.filter((c) => c.status === 'fail').length;
        result['integrationReport'] = {
          overallStatus: report.overallStatus,
          goNoGo: failCount === 0 ? 'GO' : 'NO-GO',
          failCount,
          warnCount: report.checks.filter((c) => c.status === 'warn').length,
          passCount: report.checks.filter((c) => c.status === 'pass').length,
        };
        result['compliant'] = (result['compliant'] as boolean) && failCount === 0;
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    }
  );

  // Tool: configure_session
  server.registerTool(
    'configure_session',
    {
      description:
        'Update session configuration settings. Accepts a partial config delta — only specified keys are changed. ' +
        'Emits a SessionConfigured domain event and returns the full updated config.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        config: z
          .object({
            comparison: z
              .object({
                sensitivity: z.enum(['semantic', 'exact']).optional(),
                autoDetectConflicts: z.boolean().optional(),
                suggestResolutions: z.boolean().optional(),
              })
              .optional(),
            contracts: z
              .object({
                strictness: z.enum(['strict', 'warn', 'relaxed']).optional(),
                driftNotifications: z.enum(['immediate', 'batched', 'silent']).optional(),
              })
              .optional(),
            ranking: z
              .object({
                weights: z
                  .object({
                    confidence: z.number().optional(),
                    complexity: z.number().optional(),
                    references: z.number().optional(),
                  })
                  .optional(),
                defaultTier: z.string().optional(),
              })
              .optional(),
            delegation: z
              .object({
                level: z.enum(['assisted', 'semi_autonomous', 'autonomous']).optional(),
                approvalExpiry: z.number().optional(),
              })
              .optional(),
            notifications: z
              .object({
                toastDuration: z.number().optional(),
                silentEvents: z.array(z.string()).optional(),
              })
              .optional(),
          })
          .describe('Partial session config delta — only specified sections/keys are updated'),
        changedBy: z.string().optional().describe('Name of the participant making the change (for audit trail)'),
      },
    },
    ({ code, config, changedBy }) => {
      try {
        const updatedConfig = sessionStore.updateSessionConfig(code, config as import('../schema/types.js').SessionConfig, changedBy);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ config: updatedConfig }) }],
        };
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Session not found: ${code}` }) }],
          isError: true,
        };
      }
    }
  );

  // Tool: get_session_config
  server.registerTool(
    'get_session_config',
    {
      description: 'Get the current session configuration. Returns the full config including all sections and their current values.',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      try {
        const config = sessionStore.getSessionConfig(code);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ config }) }],
        };
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Session not found: ${code}` }) }],
          isError: true,
        };
      }
    }
  );

  // Tool: send_message
  server.registerTool(
    'send_message',
    {
      description: 'Send a message to a session. Omit toParticipantId for a broadcast to all participants.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Sender participant ID'),
        content: z.string().describe('Message content'),
        toParticipantId: z.string().optional().describe('Recipient participant ID (omit for broadcast)'),
      },
    },
    ({ code, participantId, content, toParticipantId }) => {
      const msg = sessionStore.sendMessage(code, participantId, content, toParticipantId);
      if (!msg) {
        const session = sessionStore.getSession(code);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send — participant not in session or session is closed' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ sent: msg }) }],
      };
    }
  );

  // Tool: get_messages
  server.registerTool(
    'get_messages',
    {
      description: 'Get messages for a participant in a session. Pass since to retrieve only messages after that ISO timestamp.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID — only messages visible to this participant are returned'),
        since: z.string().optional().describe('ISO timestamp — only messages after this time are returned'),
      },
    },
    ({ code, participantId, since }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const messages = sessionStore.getMessages(code, participantId, since);
      const lastChecked = new Date().toISOString();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ messages, count: messages.length, lastChecked }),
        }],
      };
    }
  );

  // Tool: create_draft
  server.registerTool(
    'create_draft',
    {
      description: 'Create a draft artifact visible only to the author — a staging area before formal submission',
      inputSchema: {
        sessionCode: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID of the draft author'),
        content: z.object({
          metadata: z.object({
            role: z.string(),
            scope: z.string(),
            goal: z.string(),
            generated_at: z.string(),
            event_count: z.number(),
            assumption_count: z.number(),
          }),
          domain_events: z.array(z.any()),
          boundary_assumptions: z.array(z.any()),
        }).describe('CandidateEventsFile content for the draft'),
      },
    },
    ({ sessionCode, participantId, content }) => {
      const draft = draftService.createDraft(sessionCode, {
        participantId,
        content: content as import('../schema/types.js').CandidateEventsFile,
      });
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
  );

  // Tool: suggest_events
  server.registerTool(
    'suggest_events',
    {
      description: 'Given a natural-language domain description, return structured candidate domain events',
      inputSchema: {
        description: z.string().describe('Natural-language description of the domain'),
        existingEvents: z.array(z.string()).optional().describe('Event names already defined, to avoid duplicates'),
      },
    },
    ({ description, existingEvents }) => {
      const events = suggestEventsHeuristic(description, existingEvents ?? []);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ events }) }],
      };
    }
  );

  // Tool: suggest_improvements
  server.registerTool(
    'suggest_improvements',
    {
      description: 'Analyze a submitted artifact and return specific suggestions for improvements',
      inputSchema: {
        sessionCode: z.string().describe('Session join code'),
        fileName: z.string().describe('File name of the artifact to analyze'),
      },
    },
    ({ sessionCode, fileName }) => {
      const session = sessionStore.getSession(sessionCode);
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
  );

  // Tool: update_artifact
  server.registerTool(
    'update_artifact',
    {
      description: 'Replace a submitted artifact with a revised version, preserving the original in version history',
      inputSchema: {
        sessionCode: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID of the submitter'),
        fileName: z.string().describe('File name of the artifact to update'),
        content: z.object({
          metadata: z.object({
            role: z.string(),
            scope: z.string(),
            goal: z.string(),
            generated_at: z.string(),
            event_count: z.number(),
            assumption_count: z.number(),
          }),
          domain_events: z.array(z.any()),
          boundary_assumptions: z.array(z.any()),
        }).describe('Updated CandidateEventsFile content'),
        changeNote: z.string().optional().describe('Description of what changed in this update'),
      },
    },
    ({ sessionCode, participantId, fileName, content, changeNote }) => {
      const session = sessionStore.getSession(sessionCode);
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
      const versioned = artifactService.submit(
        sessionCode,
        participantId,
        fileName,
        content as import('../schema/types.js').CandidateEventsFile,
        'mcp',
        changeNote
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ version: versioned.version }) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Scoped tools — only registered when --session/--user are provided
  // -------------------------------------------------------------------------

  if (scoped) {
    const ctx = scoped; // capture for closures

    // Tool: my_session — get session state without needing the code
    server.registerTool(
      'my_session',
      {
        description: 'Get the current state of your session (participants, submissions, phase)',
        inputSchema: {},
      },
      () => {
        const session = sessionStore.getSession(ctx.sessionCode);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
            isError: true,
          };
        }
        const status = computeWorkflowStatus({
          participantCount: session.participants.size,
          submissionCount: session.submissions.length,
          jam: session.jam,
          contracts: session.contracts,
          integrationReport: session.integrationReport,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              you: { name: ctx.participantName, id: ctx.participantId },
              session: serializeSession(session),
              workflow: status,
            }),
          }],
        };
      }
    );

    // Tool: my_submit — submit YAML without needing code or participantId
    server.registerTool(
      'my_submit',
      {
        description: 'Submit a YAML file to your session (parse + validate + submit)',
        inputSchema: {
          fileName: z.string().describe('File name for the submission'),
          yamlContent: z.string().describe('Raw YAML string to parse and validate'),
        },
      },
      ({ fileName, yamlContent }) => {
        const outcome = parseAndValidate(fileName, yamlContent);
        if (!outcome.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'YAML validation failed', errors: outcome.errors }),
            }],
            isError: true,
          };
        }

        const submission = sessionStore.submitYaml(ctx.sessionCode, ctx.participantId, fileName, outcome.file.data);
        if (!submission) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found or participant not in session' }),
            }],
            isError: true,
          };
        }

        const prepStatus = computePrepStatus(outcome.file.data);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              submittedAt: submission.submittedAt,
              completeness: prepStatus,
            }),
          }],
        };
      }
    );

    // Tool: my_create_draft — create a draft without needing code or participantId
    server.registerTool(
      'my_create_draft',
      {
        description: 'Create a draft artifact visible only to you — a staging area before formal submission',
        inputSchema: {
          content: z.object({
            metadata: z.object({
              role: z.string(),
              scope: z.string(),
              goal: z.string(),
              generated_at: z.string(),
              event_count: z.number(),
              assumption_count: z.number(),
            }),
            domain_events: z.array(z.any()),
            boundary_assumptions: z.array(z.any()),
          }).describe('CandidateEventsFile content for the draft'),
        },
      },
      ({ content }) => {
        const draft = draftService.createDraft(ctx.sessionCode, {
          participantId: ctx.participantId,
          content: content as import('../schema/types.js').CandidateEventsFile,
        });
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
    );

    // Tool: my_update_artifact — update an artifact without needing code or participantId
    server.registerTool(
      'my_update_artifact',
      {
        description: 'Replace one of your submitted artifacts with a revised version, preserving the original in version history',
        inputSchema: {
          fileName: z.string().describe('File name of the artifact to update'),
          content: z.object({
            metadata: z.object({
              role: z.string(),
              scope: z.string(),
              goal: z.string(),
              generated_at: z.string(),
              event_count: z.number(),
              assumption_count: z.number(),
            }),
            domain_events: z.array(z.any()),
            boundary_assumptions: z.array(z.any()),
          }).describe('Updated CandidateEventsFile content'),
          changeNote: z.string().optional().describe('Description of what changed in this update'),
        },
      },
      ({ fileName, content, changeNote }) => {
        const versioned = artifactService.submit(
          ctx.sessionCode,
          ctx.participantId,
          fileName,
          content as import('../schema/types.js').CandidateEventsFile,
          'mcp',
          changeNote
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ version: versioned.version }) }],
        };
      }
    );

    // Tool: send_message — post a message to the session
    server.registerTool(
      'send_message',
      {
        description: 'Send a message to the session. Omit recipientName for a broadcast to all participants.',
        inputSchema: {
          content: z.string().describe('Message content'),
          recipientName: z.string().optional().describe('Name of a specific participant to message (omit for broadcast)'),
        },
      },
      ({ content, recipientName }) => {
        let toId: string | undefined;
        if (recipientName) {
          // Look up recipient by name
          const session = sessionStore.getSession(ctx.sessionCode);
          if (!session) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
              isError: true,
            };
          }
          for (const [id, p] of session.participants) {
            if (p.name === recipientName) {
              toId = id;
              break;
            }
          }
          if (!toId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ error: `Participant "${recipientName}" not found in session` }),
              }],
              isError: true,
            };
          }
        }

        const msg = sessionStore.sendMessage(ctx.sessionCode, ctx.participantId, content, toId);
        if (!msg) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send message' }) }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sent: msg }),
          }],
        };
      }
    );

    // Tool: check_messages — poll for messages
    server.registerTool(
      'check_messages',
      {
        description: 'Check for new messages in your session. Pass the lastChecked timestamp from a prior call to get only new messages.',
        inputSchema: {
          since: z.string().optional().describe('ISO timestamp from a prior check; only messages after this time are returned'),
        },
      },
      ({ since }) => {
        const messages = sessionStore.getMessages(ctx.sessionCode, ctx.participantId, since);
        const lastChecked = new Date().toISOString();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              messages,
              count: messages.length,
              lastChecked,
            }),
          }],
        };
      }
    );
  }

  const transport = new StdioServerTransport();

  const modeLabel = scoped ? `scoped to ${scoped.participantName}@${scoped.sessionCode}` : 'unscoped';
  console.error(`[mcp] starting multi-human-workflows MCP server (${modeLabel})`);

  await server.connect(transport);

  console.error('[mcp] server connected via stdio transport');
}

main().catch((err: unknown) => {
  console.error('[mcp] fatal error:', err);
  process.exit(1);
});
