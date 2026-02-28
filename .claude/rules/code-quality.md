# Code Quality

## Screaming Architecture

The directory structure must communicate the domain, not the framework:

- Directory names reveal business intent (e.g., `schema/`, `lib/grouping.ts`, `lib/path-tracing.ts`)
- File names match the concept they implement, not the pattern they use
- A newcomer reading `src/` should understand what this app does before seeing any code

## No Duplication

- Extract shared logic into `src/lib/` immediately when a pattern appears twice
- Prefer a single source of truth over convenience copies
- When two components need the same data transform, it belongs in `lib/`, not duplicated in each component
- Constants shared across files belong in a dedicated module, not copy-pasted

## Documentation Discipline

- When filling gaps in a feature area, update relevant documentation (CLAUDE.md, rules, README) in the same commit
- Keep documentation unambiguous — "consider" is not a rule; "always do X" is
- If a rule no longer applies, remove it rather than leaving it to confuse
