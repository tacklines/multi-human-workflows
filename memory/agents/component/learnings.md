# Learnings: component

## Codebase Patterns
- One custom element per file, registered via `@customElement('tag-name')` decorator
- Shoelace components imported per-component (tree-shaking, not full bundle)
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig (required for Lit)

## Gotchas
- (none yet)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
