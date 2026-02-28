/** Types matching candidate-events.schema.json */

export type Confidence = 'CONFIRMED' | 'LIKELY' | 'POSSIBLE';
export type Direction = 'inbound' | 'outbound' | 'internal';
export type AssumptionType = 'ownership' | 'contract' | 'ordering' | 'existence';

export interface PayloadField {
  field: string;
  type: string;
}

export interface Integration {
  direction: Direction;
  channel?: string;
}

export interface DomainEvent {
  name: string;
  aggregate: string;
  trigger: string;
  payload: PayloadField[];
  state_change?: string;
  integration: Integration;
  sources?: string[];
  confidence: Confidence;
  notes?: string;
}

export interface BoundaryAssumption {
  id: string;
  type: AssumptionType;
  statement: string;
  affects_events: string[];
  confidence: Confidence;
  verify_with: string;
}

export interface CandidateEventsMetadata {
  role: string;
  scope: string;
  goal: string;
  generated_at: string;
  event_count: number;
  assumption_count: number;
}

export interface CandidateEventsFile {
  metadata: CandidateEventsMetadata;
  domain_events: DomainEvent[];
  boundary_assumptions: BoundaryAssumption[];
}

/** A loaded file with its parsed data and source info */
export interface LoadedFile {
  filename: string;
  role: string;
  data: CandidateEventsFile;
}
