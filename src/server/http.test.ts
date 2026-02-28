import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventStore } from '../contexts/session/event-store.js';
import { createSseHandler } from './http.js';
import type { DomainEvent } from '../contexts/session/domain-events.js';
import type http from 'node:http';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

function makeEvent(sessionCode: string, type: DomainEvent['type'] = 'SessionCreated'): DomainEvent {
  if (type === 'SessionCreated') {
    return {
      eventId: crypto.randomUUID(),
      sessionCode,
      timestamp: new Date().toISOString(),
      type: 'SessionCreated',
      creatorName: 'Alice',
      creatorId: 'p-001',
    };
  }
  if (type === 'ParticipantJoined') {
    return {
      eventId: crypto.randomUUID(),
      sessionCode,
      timestamp: new Date().toISOString(),
      type: 'ParticipantJoined',
      participantId: 'p-002',
      participantName: 'Bob',
      participantType: 'human',
    };
  }
  // fallback — ArtifactSubmitted
  return {
    eventId: crypto.randomUUID(),
    sessionCode,
    timestamp: new Date().toISOString(),
    type: 'ArtifactSubmitted',
    artifactId: 'a-001',
    participantId: 'p-001',
    fileName: 'events.yaml',
    artifactType: 'candidate-events',
    version: 1,
  };
}

function makeMockRes() {
  const written: string[] = [];
  return {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => { written.push(chunk); }),
    written,
  };
}

function makeMockReq() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    on: vi.fn((event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    emit: (event: string) => {
      listeners[event]?.forEach((cb) => cb());
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSseHandler', () => {
  let es: EventStore;
  let handler: ReturnType<typeof createSseHandler>;

  beforeEach(() => {
    es = new EventStore();
    handler = createSseHandler(es);
  });

  describe('Given a new SSE connection', () => {
    it('sends the connected comment and sets SSE headers', () => {
      const req = makeMockReq();
      const res = makeMockRes();

      handler(
        req as unknown as http.IncomingMessage,
        res as unknown as import('node:http').ServerResponse,
        'SESS1'
      );

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
      }));
      expect(res.written[0]).toBe(': connected\n\n');
    });
  });

  describe('Given a live domain event is appended after subscribing', () => {
    it('forwards only events matching the subscribed session code', () => {
      const req = makeMockReq();
      const res = makeMockRes();

      handler(
        req as unknown as http.IncomingMessage,
        res as unknown as import('node:http').ServerResponse,
        'SESS1'
      );

      // Append an event for the subscribed session
      const evt1 = makeEvent('SESS1', 'ParticipantJoined');
      es.append('SESS1', evt1);

      // Append an event for a different session — should NOT be forwarded
      const evt2 = makeEvent('SESS2', 'SessionCreated');
      es.append('SESS2', evt2);

      // written[0] is the `: connected` comment; written[1] should be the SESS1 event
      expect(res.written).toHaveLength(2);
      expect(res.written[1]).toContain('event: ParticipantJoined\n');
      expect(res.written[1]).toContain('"sessionCode":"SESS1"');
    });

    it('serializes the full domain event as JSON in the data field', () => {
      const req = makeMockReq();
      const res = makeMockRes();

      handler(
        req as unknown as http.IncomingMessage,
        res as unknown as import('node:http').ServerResponse,
        'SESS1'
      );

      const evt = makeEvent('SESS1', 'ParticipantJoined');
      es.append('SESS1', evt);

      const sseFrame = res.written[1];
      const dataLine = sseFrame.split('\n').find((l) => l.startsWith('data:'));
      expect(dataLine).toBeDefined();
      const parsed = JSON.parse(dataLine!.slice('data:'.length).trim());
      expect(parsed.type).toBe('ParticipantJoined');
      expect(parsed.sessionCode).toBe('SESS1');
    });
  });

  describe('Given a ?since= timestamp is provided', () => {
    it('replays historical events before starting the live stream', () => {
      // Append historical events to the EventStore before the SSE handler is called
      const t1 = '2024-01-01T00:00:00.000Z';
      const t2 = '2024-01-02T00:00:00.000Z';
      const oldEvent: DomainEvent = {
        eventId: 'e-old',
        sessionCode: 'SESS1',
        timestamp: t1,
        type: 'SessionCreated',
        creatorName: 'Alice',
        creatorId: 'p-001',
      };
      const newEvent: DomainEvent = {
        eventId: 'e-new',
        sessionCode: 'SESS1',
        timestamp: t2,
        type: 'ParticipantJoined',
        participantId: 'p-002',
        participantName: 'Bob',
        participantType: 'human',
      };
      es.append('SESS1', oldEvent);
      es.append('SESS1', newEvent);

      const req = makeMockReq();
      const res = makeMockRes();

      // since=t1 means replay events with timestamp > t1, so only newEvent
      handler(
        req as unknown as http.IncomingMessage,
        res as unknown as import('node:http').ServerResponse,
        'SESS1',
        t1
      );

      // written[0] = `: connected`
      // written[1] = replayed newEvent
      expect(res.written).toHaveLength(2);
      expect(res.written[1]).toContain('event: ParticipantJoined\n');
      expect(res.written[1]).toContain('"eventId":"e-new"');
    });

    it('sends no historical events when since= is after all existing events', () => {
      const t1 = '2024-01-01T00:00:00.000Z';
      const oldEvent: DomainEvent = {
        eventId: 'e-old',
        sessionCode: 'SESS1',
        timestamp: t1,
        type: 'SessionCreated',
        creatorName: 'Alice',
        creatorId: 'p-001',
      };
      es.append('SESS1', oldEvent);

      const req = makeMockReq();
      const res = makeMockRes();

      // since= a timestamp after all events — no replay
      handler(
        req as unknown as http.IncomingMessage,
        res as unknown as import('node:http').ServerResponse,
        'SESS1',
        '2025-01-01T00:00:00.000Z'
      );

      expect(res.written).toHaveLength(1); // only the `: connected` comment
    });
  });

  describe('Given the client disconnects', () => {
    it('removes the EventStore subscription so no further events are sent', () => {
      const req = makeMockReq();
      const res = makeMockRes();

      handler(
        req as unknown as http.IncomingMessage,
        res as unknown as import('node:http').ServerResponse,
        'SESS1'
      );

      // Simulate client disconnect
      req.emit('close');

      // Append an event after disconnect — should NOT be forwarded
      const evt = makeEvent('SESS1', 'ParticipantJoined');
      es.append('SESS1', evt);

      // Only the `: connected` comment should have been written
      expect(res.written).toHaveLength(1);
    });
  });
});
