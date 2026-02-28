# Learnings: tester

## Codebase Patterns
- Test runner is Vitest (`npm test` for run, `npm run test:watch` for watch mode)
- Tests colocated next to source files (`foo.test.ts` beside `foo.ts`)
- Type checking via `npx tsc --noEmit` (separate from test run)
- Definition of done requires: happy path + at least one error path per pure function

## Gotchas
- (none yet)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
