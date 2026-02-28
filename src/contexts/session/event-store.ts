/**
 * Append-only event store with subscribe/replay capability.
 * Used by domain services that need to emit or observe domain events
 * independently of the session store.
 */

export interface DomainEventEnvelope {
  id: string;
  type: string;
  occurredAt: string;
  payload: unknown;
}

export type EventHandler = (event: DomainEventEnvelope) => void;

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class EventStore {
  private events: DomainEventEnvelope[] = [];
  private handlers: EventHandler[] = [];

  append(type: string, payload: unknown): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      id: generateId(),
      type,
      occurredAt: new Date().toISOString(),
      payload,
    };
    this.events.push(envelope);
    for (const handler of this.handlers) {
      handler(envelope);
    }
    return envelope;
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  replay(): DomainEventEnvelope[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
