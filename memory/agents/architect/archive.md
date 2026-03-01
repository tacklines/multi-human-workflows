# Archive: architect

Entries moved here during retro 2026-02-28. Low-reuse or already-implemented patterns.

## One-Time Implementation Details
- `DOMAIN_EVENT_TYPES` array needs `as const` for TypeScript to narrow element type to `DomainEventType` (added: 2026-02-28, dispatch: a6r.6)
- Snapshot listener set with `Array.from(this.listeners)` before notification iteration — guards against listeners that unsubscribe themselves during callback (added: 2026-02-28, dispatch: a6r.7)
- `getEvents()` returns defensive copy (spread into new array) so callers cannot corrupt internal log (added: 2026-02-28, dispatch: a6r.7)
- For `ArtifactSubmitted.version`, count prior same-participant/same-file submissions as in-place version counter (added: 2026-02-28, dispatch: a6r.8)
- `LoadedFile` lives in `src/schema/types.ts`, not `src/lib/session-store.ts` — session-store imports it from schema (added: 2026-02-28, dispatch: a6r.16)
- When adding contexts that server code imports, add them to `tsconfig.server.json` include array (added: 2026-02-28, dispatch: a6r.16)
- For `Map`-valued projection state, `new Map(this.state.ownership)` in `getState()` is the right defensive copy pattern (added: 2026-02-28, dispatch: a6r.10)
- When adding a required field to a core interface (`Session`), run `tsc --noEmit` immediately to discover all fixture helpers that need it added (added: 2026-02-28, dispatch: a6r.17)
- `?? 'active'` default in `sessionFromJson`/`deserializeSession` is the right pattern for adding required fields to persisted data (added: 2026-02-28, dispatch: a6r.17)
- Version chains keyed by `participant+fileName` composite — each unique combo gets independent version numbering starting at 1 (added: 2026-02-28, dispatch: a6r.18)
- `SubmissionProtocol = 'web' | 'mcp' | 'a2a'` lives in `src/schema/types.ts` alongside other shared types (added: 2026-02-28, dispatch: a6r.18)
- Define a local `SessionData` interface with only the fields the service needs — documents dependency surface (added: 2026-02-28, dispatch: a6r.19)
- `checkCompliance` and `detectDrift` are stateless — take/derive data, return report, no mutations (added: 2026-02-28, dispatch: a6r.19)
- Export shared low-level utilities (like `generateId`) from their point of definition rather than duplicating (added: 2026-02-28, dispatch: a6r.15)
- Storing credentials as plaintext `"value"` in realm JSON is safe for dev imports — Keycloak hashes them on first write (added: 2026-02-28, dispatch: a6r.25)
- `z.string().optional()` with Zod produces `string | undefined` in handler — TypeScript handles correctly (added: 2026-02-28, dispatch: ppc.8+ppc.5)

## Archived Sprint 8 Retro (2026-03-01)
- `WebSocketServer` attaches via `{ server: httpServer }` — no explicit `upgrade` wiring needed (added: 2026-02-28)
- `heartbeatTimer.unref()` prevents tests from hanging (added: 2026-02-28)
- A2A spec v0.2.5 uses `message/send` as primary method, not `tasks/send` (added: 2026-02-28)
- A2A synchronous in-memory ops: `submitted → working → completed` in one request cycle (added: 2026-02-28)
- Keycloak `--import-realm` with volume mount to `/opt/keycloak/data/import/` for pre-configured realm (added: 2026-02-28)
