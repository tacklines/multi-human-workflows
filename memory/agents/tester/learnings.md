# Learnings: tester

## Codebase Patterns
- Test runner is Vitest (`npm test` for run, `npm run test:watch` for watch mode)
- Tests colocated next to source files (`foo.test.ts` beside `foo.ts`)
- Type checking via `npx tsc --noEmit` (separate from test run)
- Definition of done requires: happy path + at least one error path per pure function

## Gotchas
- Test commands require `dangerouslyDisableSandbox: true` due to bwrap loopback restrictions in sandbox (added: 2026-02-28, dispatch: multi-human-workflows-8ge)
- Build produces ~1.9 MB chunk with rollup advisory — not blocking but note if bundle size becomes a concern (added: 2026-02-28, dispatch: multi-human-workflows-8ge)
- Worktrees don't inherit node_modules from parent repo — must run `npm install` before `tsc --noEmit` or tests (added: 2026-03-01, dispatch: 36k)
- Storybook TS errors: TS2307 (module not found) cascades from missing node_modules, not wrong import paths; TS7006 (implicit any on render callback) fixed with explicit `Args` type annotation (added: 2026-03-01, dispatch: 36k)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
