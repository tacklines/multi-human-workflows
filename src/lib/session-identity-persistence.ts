/**
 * Typed localStorage wrapper for active session identity.
 *
 * Persists the minimum session state needed to reconnect after a page refresh:
 * the session code and the participant ID for this browser tab. The full
 * session snapshot (participants, submissions) is refreshed from the server
 * on reconnect.
 *
 * Storage key: `seam-active-session`
 */

export interface PersistedSessionIdentity {
  code: string;
  participantId: string;
}

const STORAGE_KEY = 'seam-active-session';

/**
 * Write session identity to localStorage. Silently swallows storage errors.
 */
export function saveSessionIdentity(code: string, participantId: string): void {
  try {
    const value: PersistedSessionIdentity = { code, participantId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded).
    // Silently swallow — reconnection is a best-effort feature.
  }
}

/**
 * Read persisted session identity from localStorage.
 * Returns null if nothing is stored or the stored value is malformed.
 */
export function loadSessionIdentity(): PersistedSessionIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)['code'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['participantId'] === 'string'
    ) {
      return parsed as PersistedSessionIdentity;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove persisted session identity from localStorage.
 * Call this when the user deliberately leaves a session.
 */
export function clearSessionIdentity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently swallow.
  }
}
