/**
 * Typed localStorage wrapper for per-session configuration.
 *
 * SessionConfig is shared across all participants of a session, but also
 * persisted locally so that solo-mode and session-mode settings survive
 * a page refresh without needing a round-trip to the server.
 *
 * Storage keys:
 *   solo mode:    `seam-session-config`
 *   session mode: `seam-session-config-${sessionCode}`
 */

import { type SessionConfig, DEFAULT_SESSION_CONFIG } from '../schema/types.js';

const BASE_STORAGE_KEY = 'seam-session-config';

function storageKey(sessionCode?: string): string {
  return sessionCode ? `${BASE_STORAGE_KEY}-${sessionCode}` : BASE_STORAGE_KEY;
}

function readConfig(sessionCode?: string): SessionConfig {
  try {
    const raw = localStorage.getItem(storageKey(sessionCode));
    if (!raw) return { ...DEFAULT_SESSION_CONFIG };
    const parsed = JSON.parse(raw) as Partial<SessionConfig>;
    return { ...DEFAULT_SESSION_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_SESSION_CONFIG };
  }
}

function writeConfig(config: SessionConfig, sessionCode?: string): void {
  try {
    localStorage.setItem(storageKey(sessionCode), JSON.stringify(config));
  } catch {
    // localStorage may be unavailable (e.g. in private browsing with storage blocked).
    // Silently swallow — callers should not need to handle this.
  }
}

/**
 * Reads session config from localStorage, merging with DEFAULT_SESSION_CONFIG
 * so that any missing keys always have a sane value.
 *
 * @param sessionCode - When provided, reads from the session-scoped key.
 *   Omit (or pass `undefined`) for solo-mode storage.
 */
export function loadSessionConfig(sessionCode?: string): SessionConfig {
  return readConfig(sessionCode);
}

/**
 * Persists the full session config to localStorage.
 *
 * The change is applied immediately — no "Save" step required.
 * Silently swallows storage errors (quota exceeded, private mode, etc.).
 *
 * @param config - The full SessionConfig object to persist.
 * @param sessionCode - When provided, writes to the session-scoped key.
 *   Omit (or pass `undefined`) for solo-mode storage.
 */
export function saveSessionConfig(config: SessionConfig, sessionCode?: string): void {
  writeConfig(config, sessionCode);
}
