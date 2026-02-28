# Learnings: architect

## Codebase Patterns
- Schema is the contract: YAML files validate against `src/schema/candidate-events.schema.json` (DO NOT MODIFY this file -- shared with tackline pipeline)
- State is a singleton pub/sub store at `src/state/app-state.ts`, framework-independent
- Path alias `@` maps to `/src` in both Vite and vitest configs

## Gotchas
- (none yet)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
