import type { SessionStatus, SessionTransitionAction } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Valid transition table
// active  -> pause  => paused
// paused  -> resume => active
// active  -> close  => closed
// paused  -> close  => closed
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<SessionStatus, Partial<Record<SessionTransitionAction, SessionStatus>>> = {
  active: {
    pause: 'paused',
    close: 'closed',
  },
  paused: {
    resume: 'active',
    close: 'closed',
  },
  closed: {},
};

/**
 * Returns true if the given action is a valid transition from the current status.
 */
export function canTransition(
  current: SessionStatus,
  action: SessionTransitionAction
): boolean {
  return action in TRANSITIONS[current];
}

/**
 * Returns the next SessionStatus after applying the action.
 * Throws a descriptive error if the transition is invalid.
 */
export function transitionSession(
  current: SessionStatus,
  action: SessionTransitionAction
): SessionStatus {
  const next = TRANSITIONS[current][action];
  if (next === undefined) {
    throw new Error(
      `Invalid session transition: cannot '${action}' a session that is '${current}'`
    );
  }
  return next;
}
