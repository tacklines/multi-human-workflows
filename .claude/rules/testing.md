---
paths:
  - "src/**/*.ts"
---

# Testing

## Framework

Vitest 4. Config in `vitest.config.ts`.

## Conventions

- Tests are colocated: `src/lib/foo.ts` -> `src/lib/foo.test.ts`
- Test pattern: `src/**/*.test.ts`
- Path alias `@` resolves to `/src` in test config

## Running

```bash
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
```

## Style

- Use `describe` blocks named with Given/When/Then intent
- Import from vitest: `describe`, `it`, `expect`
- Import source modules with `.js` extension (ESM resolution)

## What to Test

- Pure functions in `src/lib/` -- always test
- Schema validation edge cases -- always test
- State store mutations -- test when behavior is non-obvious
- Components -- manual verification via dev server is acceptable for now
