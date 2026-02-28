import { SessionStore } from '../lib/session-store.js';
import { SessionPersistence } from '../lib/session-persistence.js';

const DATA_PATH = process.env.SESSION_DATA_PATH ?? './data/sessions.json';

const persistence = new SessionPersistence(DATA_PATH);

/** Shared singleton SessionStore used by both the HTTP server and MCP server. */
export const sessionStore = new SessionStore();

// Load persisted sessions on startup
try {
  const loaded = persistence.load();
  sessionStore.loadSessions(loaded);
  if (loaded.size > 0) {
    console.error(`[store] restored ${loaded.size} session(s) from ${DATA_PATH}`);
  }
} catch (err) {
  console.error('[store] failed to load persisted sessions:', err);
}

/** Save all sessions to disk. Call after mutations. */
export function persistSessions(): void {
  try {
    persistence.save(sessionStore.exportSessions());
  } catch (err) {
    console.error('[store] failed to persist sessions:', err);
  }
}
