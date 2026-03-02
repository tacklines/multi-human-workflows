/**
 * Activity Pulse — tracks per-participant activity timestamps and notifies
 * subscribers so UI components can briefly animate participant avatars.
 *
 * This module is the exception to "lib/ is pure functions": it maintains a
 * Map of timestamps and a subscriber list, making it a lightweight event bus.
 * It has no DOM dependencies and no side effects beyond its own state.
 */

/** Timestamp map: participantId → last activity epoch ms */
const _timestamps = new Map<string, number>();

/** Subscriber callbacks */
const _subscribers = new Set<(participantId: string) => void>();

/**
 * Record that a participant performed an action right now.
 * Notifies all active subscribers.
 */
export function recordActivity(participantId: string): void {
  _timestamps.set(participantId, Date.now());
  for (const cb of _subscribers) {
    cb(participantId);
  }
}

/**
 * Returns true if the participant has had activity within the given window.
 * @param participantId  Participant to query.
 * @param windowMs       Look-back window in milliseconds (default 2000).
 */
export function getRecentActivity(participantId: string, windowMs = 2000): boolean {
  const last = _timestamps.get(participantId);
  if (last === undefined) return false;
  return Date.now() - last <= windowMs;
}

/**
 * Subscribe to activity events.
 * Returns an unsubscribe function — call it in disconnectedCallback.
 */
export function onActivity(callback: (participantId: string) => void): () => void {
  _subscribers.add(callback);
  return () => {
    _subscribers.delete(callback);
  };
}

/**
 * Reset all state. Exposed for test isolation only — do not call in production.
 * @internal
 */
export function _reset(): void {
  _timestamps.clear();
  _subscribers.clear();
}
