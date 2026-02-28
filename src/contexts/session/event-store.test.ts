import { describe, it, expect, vi } from "vitest";
import { EventStore } from "./event-store.js";
import { DomainEvent } from "./domain-events.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const SESSION_A = "ABC123";
const SESSION_B = "XYZ789";

function makeSessionCreated(
  overrides: Partial<DomainEvent> = {}
): DomainEvent {
  return {
    eventId: "evt-001",
    sessionCode: SESSION_A,
    timestamp: "2026-02-28T10:00:00.000Z",
    type: "SessionCreated",
    creatorName: "Alice",
    creatorId: "user-1",
    ...overrides,
  } as DomainEvent;
}

function makeParticipantJoined(
  overrides: Partial<DomainEvent> = {}
): DomainEvent {
  return {
    eventId: "evt-002",
    sessionCode: SESSION_A,
    timestamp: "2026-02-28T10:01:00.000Z",
    type: "ParticipantJoined",
    participantId: "p-1",
    participantName: "Bob",
    participantType: "human",
    ...overrides,
  } as DomainEvent;
}

function makeSessionClosed(
  overrides: Partial<DomainEvent> = {}
): DomainEvent {
  return {
    eventId: "evt-003",
    sessionCode: SESSION_A,
    timestamp: "2026-02-28T11:00:00.000Z",
    type: "SessionClosed",
    reason: "Done",
    ...overrides,
  } as DomainEvent;
}

// ---------------------------------------------------------------------------
// append and getEvents
// ---------------------------------------------------------------------------

describe("Given an empty EventStore", () => {
  it("When getEvents is called for a session with no events, Then it returns an empty array", () => {
    const store = new EventStore();
    expect(store.getEvents(SESSION_A)).toEqual([]);
  });

  it("When an event is appended, Then getEvents returns it", () => {
    const store = new EventStore();
    const event = makeSessionCreated();
    store.append(SESSION_A, event);
    expect(store.getEvents(SESSION_A)).toHaveLength(1);
    expect(store.getEvents(SESSION_A)[0]).toMatchObject({ type: "SessionCreated" });
  });

  it("When multiple events are appended, Then getEvents returns them in append order", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated());
    store.append(SESSION_A, makeParticipantJoined());
    store.append(SESSION_A, makeSessionClosed());
    const events = store.getEvents(SESSION_A);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      "SessionCreated",
      "ParticipantJoined",
      "SessionClosed",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("Given an event with a malformed payload", () => {
  it("When appended, Then append throws a ZodError", () => {
    const store = new EventStore();
    const malformed = {
      eventId: "evt-bad",
      sessionCode: SESSION_A,
      timestamp: "2026-02-28T10:00:00.000Z",
      type: "SessionCreated",
      // missing creatorName and creatorId
    };
    expect(() => store.append(SESSION_A, malformed as DomainEvent)).toThrow();
  });

  it("When appended with an unknown type, Then append throws", () => {
    const store = new EventStore();
    const unknown = {
      eventId: "evt-bad",
      sessionCode: SESSION_A,
      timestamp: "2026-02-28T10:00:00.000Z",
      type: "UnknownEvent",
    };
    expect(() => store.append(SESSION_A, unknown as DomainEvent)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getEventsSince
// ---------------------------------------------------------------------------

describe("Given a session with three events at different timestamps", () => {
  function makeStore() {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated({ timestamp: "2026-02-28T10:00:00.000Z" }));
    store.append(SESSION_A, makeParticipantJoined({ timestamp: "2026-02-28T10:01:00.000Z" }));
    store.append(SESSION_A, makeSessionClosed({ timestamp: "2026-02-28T11:00:00.000Z" }));
    return store;
  }

  it("When getEventsSince is called with the first event's timestamp, Then it returns the two later events", () => {
    const store = makeStore();
    const result = store.getEventsSince(SESSION_A, "2026-02-28T10:00:00.000Z");
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.type)).toEqual(["ParticipantJoined", "SessionClosed"]);
  });

  it("When getEventsSince is called with the last event's timestamp, Then it returns an empty array", () => {
    const store = makeStore();
    const result = store.getEventsSince(SESSION_A, "2026-02-28T11:00:00.000Z");
    expect(result).toHaveLength(0);
  });

  it("When getEventsSince is called with a timestamp before all events, Then it returns all events", () => {
    const store = makeStore();
    const result = store.getEventsSince(SESSION_A, "2026-02-28T09:00:00.000Z");
    expect(result).toHaveLength(3);
  });

  it("When getEventsSince is called for a session with no events, Then it returns an empty array", () => {
    const store = makeStore();
    const result = store.getEventsSince("NOPE", "2026-02-28T10:00:00.000Z");
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// subscribe / notify
// ---------------------------------------------------------------------------

describe("Given a subscriber registered with the EventStore", () => {
  it("When an event is appended, Then the listener is called with that event", () => {
    const store = new EventStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const event = makeSessionCreated();
    store.append(SESSION_A, event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "SessionCreated" }));
  });

  it("When multiple events are appended, Then the listener is called for each one", () => {
    const store = new EventStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.append(SESSION_A, makeSessionCreated());
    store.append(SESSION_A, makeParticipantJoined());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("Given a subscriber that has unsubscribed", () => {
  it("When an event is appended, Then the listener is NOT called", () => {
    const store = new EventStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.append(SESSION_A, makeSessionCreated());
    expect(listener).not.toHaveBeenCalled();
  });

  it("When unsubscribe is called multiple times, Then it is idempotent", () => {
    const store = new EventStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    unsubscribe(); // second call should not throw
    store.append(SESSION_A, makeSessionCreated());
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// replay
// ---------------------------------------------------------------------------

describe("Given a session with three events", () => {
  it("When replay is called, Then the projector receives all events in order", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated());
    store.append(SESSION_A, makeParticipantJoined());
    store.append(SESSION_A, makeSessionClosed());

    const received: string[] = [];
    store.replay(SESSION_A, (e) => received.push(e.type));
    expect(received).toEqual(["SessionCreated", "ParticipantJoined", "SessionClosed"]);
  });

  it("When replay is called for a session with no events, Then the projector is never called", () => {
    const store = new EventStore();
    const projector = vi.fn();
    store.replay("NOPE", projector);
    expect(projector).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getSessionCodes
// ---------------------------------------------------------------------------

describe("Given events appended to multiple sessions", () => {
  it("When getSessionCodes is called, Then it returns all session codes", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated({ sessionCode: SESSION_A }));
    store.append(SESSION_B, makeSessionCreated({ sessionCode: SESSION_B, eventId: "evt-b-1", creatorName: "Carol", creatorId: "user-2" }));
    const codes = store.getSessionCodes();
    expect(codes).toContain(SESSION_A);
    expect(codes).toContain(SESSION_B);
    expect(codes).toHaveLength(2);
  });

  it("When no events have been appended, Then getSessionCodes returns an empty array", () => {
    const store = new EventStore();
    expect(store.getSessionCodes()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Session isolation
// ---------------------------------------------------------------------------

describe("Given events appended to two different sessions", () => {
  it("When getEvents is called per session, Then events are isolated and do not bleed across sessions", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated({ sessionCode: SESSION_A }));
    store.append(SESSION_B, makeSessionCreated({ sessionCode: SESSION_B, eventId: "evt-b-1", creatorName: "Carol", creatorId: "user-2" }));
    store.append(SESSION_B, makeParticipantJoined({ sessionCode: SESSION_B, eventId: "evt-b-2" }));

    expect(store.getEvents(SESSION_A)).toHaveLength(1);
    expect(store.getEvents(SESSION_B)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe("Given a session with events", () => {
  it("When clear is called, Then that session's events are removed", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated());
    store.append(SESSION_A, makeParticipantJoined());
    store.clear(SESSION_A);
    expect(store.getEvents(SESSION_A)).toEqual([]);
  });

  it("When clear is called for one session, Then the other session's events are unaffected", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated({ sessionCode: SESSION_A }));
    store.append(SESSION_B, makeSessionCreated({ sessionCode: SESSION_B, eventId: "evt-b-1", creatorName: "Carol", creatorId: "user-2" }));
    store.clear(SESSION_A);
    expect(store.getEvents(SESSION_A)).toEqual([]);
    expect(store.getEvents(SESSION_B)).toHaveLength(1);
  });

  it("When clear is called for a session that has no events, Then it is a no-op", () => {
    const store = new EventStore();
    expect(() => store.clear("NOPE")).not.toThrow();
    expect(store.getEvents("NOPE")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEvents returns a defensive copy
// ---------------------------------------------------------------------------

describe("Given a snapshot returned by getEvents", () => {
  it("When the caller mutates the returned array, Then the internal log is not affected", () => {
    const store = new EventStore();
    store.append(SESSION_A, makeSessionCreated());
    const snapshot = store.getEvents(SESSION_A);
    snapshot.push(makeParticipantJoined()); // mutate the copy
    expect(store.getEvents(SESSION_A)).toHaveLength(1);
  });
});
