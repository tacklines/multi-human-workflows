# Definition of Done

## New Feature

- [ ] Traces to a phase/section in `docs/experience-design.md` (or documents why it diverges)
- [ ] Implementation in the appropriate `src/` subdirectory
- [ ] Types defined or extended in `src/schema/types.ts` if needed
- [ ] Tests pass: `npm test`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] If it is a new component: one file, one `@customElement`, registered tag name matches filename
- [ ] Accessible: keyboard-navigable, screen-reader-announced, color never sole differentiator

## Bug Fix

- [ ] Failing test that reproduces the bug (written first)
- [ ] Fix applied
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npx tsc --noEmit`

## Pure Function (in src/lib/)

- [ ] Function exported from the module
- [ ] Colocated test file (`foo.test.ts` next to `foo.ts`)
- [ ] Tests cover happy path + at least one error path
- [ ] No DOM dependencies -- pure data in, data out

## Web Component (in src/components/)

- [ ] Single file with `@customElement` decorator
- [ ] Properties typed and documented
- [ ] Shoelace imports are per-component, not the full bundle
- [ ] Component renders without errors in the dev server
- [ ] All interactive elements keyboard-navigable with visible focus indicators
- [ ] Semantic HTML or ARIA roles/labels for non-text content
- [ ] Dynamic content updates use `aria-live` regions where appropriate

## MCP Tool / API Endpoint (in src/server/)

- [ ] Input/output schema matches `docs/experience-design.md` appendix (or documents divergence)
- [ ] UI action and MCP tool produce the same domain event
- [ ] Idempotent: repeated calls with the same input produce the same result
- [ ] Duplicate submissions handled gracefully (no silent data corruption)
- [ ] Error responses include actionable context (what failed, why, what to do)
