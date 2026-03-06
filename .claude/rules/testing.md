# Testing

## Server (Rust)

```bash
cd server && cargo test        # or: just test
```

- Tests live alongside source in `#[cfg(test)]` modules
- Integration tests go in `server/tests/`
- Use `sqlx::test` for database-dependent tests

## Frontend (TypeScript)

Vitest with jsdom environment. Tests live alongside source as `*.test.ts` files.

```bash
cd frontend && npm test            # vitest run (all tests)
cd frontend && npx tsc --noEmit    # or: just check-frontend (type check only)
```

- Test files match `src/**/*.test.ts`
- Config: `frontend/vitest.config.ts`
- Environment: jsdom (suitable for DOM-dependent Lit component tests)

## Agents (Python)

No test suite currently configured. Manual verification via CLI:

```bash
cd agents && uv run python -m seam_agents.cli <code> --skill triage
```

## Full Check

```bash
just check-all    # cargo check + tsc --noEmit
```
