/**
 * Result types for the Protocol Gateway ACL.
 *
 * These types represent the gateway's outward-facing contracts — what
 * protocol adapters (MCP, HTTP) receive from the gateway. They are
 * serialization-friendly (no Maps, no mutable internals).
 */

import type {
  SerializedSession,
} from '../../lib/session-store.js';
import type {
  LoadedFile,
  JamArtifacts,
  ConflictResolution,
  OwnershipAssignment,
  UnresolvedItem,
  ContractBundle,
  IntegrationReport,
} from '../../schema/types.js';
import type { WorkflowStatus } from '../../lib/workflow-engine.js';
import type { SessionPrepStatus } from '../../lib/prep-completeness.js';
import type { Overlap } from '../../lib/comparison.js';

export interface CreateSessionResult {
  session: SerializedSession;
  creatorId: string;
  code: string;
}

export interface JoinSessionResult {
  session: SerializedSession;
  participantId: string;
}

export interface SubmitResult {
  submittedAt: string;
}

/** Serialized read-only view of a session. Identical to SerializedSession for now. */
export type SessionView = SerializedSession;

export type {
  LoadedFile,
  JamArtifacts,
  ConflictResolution,
  OwnershipAssignment,
  UnresolvedItem,
  ContractBundle,
  IntegrationReport,
  WorkflowStatus,
  SessionPrepStatus,
  Overlap as ComparisonResult,
};
