# Definition of Done

## New Feature

- [ ] Implementation in the appropriate `src/` subdirectory
- [ ] Types defined or extended in `src/schema/types.ts` if needed
- [ ] Tests pass: `npm test`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] If it is a new component: one file, one `@customElement`, registered tag name matches filename

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
