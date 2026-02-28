# Learnings: component

## Codebase Patterns
- One custom element per file, registered via `@customElement('tag-name')` decorator
- Shoelace components imported per-component (tree-shaking, not full bundle)
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig (required for Lit)

## Gotchas
- `@types/d3-drag` not available; use native pointer events with `setPointerCapture`/`releasePointerCapture` instead (added: 2026-02-28, dispatch: multi-human-workflows-sfd)
- Bidirectional d3-zoom sync (e.g., minimap <-> main canvas) requires a `_updatingFromMinimap` flag to prevent re-entrant zoom event loops (added: 2026-02-28, dispatch: multi-human-workflows-sfd)
- Worktree branches based on old commits may have incompatible types when merged with main; extract standalone components and manually integrate the rest (added: 2026-02-28, dispatch: multi-human-workflows-imt)
- SVG `@dblclick` on `<g>` propagates to parent click handlers — use `e.stopPropagation()` to prevent single-click from also firing (added: 2026-02-28, dispatch: multi-human-workflows-2kp)
- When a node appears in `nodes[]` for edge routing but needs special rendering (e.g., collapsed aggregate), keep a separate list and filter it from the regular render loop (added: 2026-02-28, dispatch: multi-human-workflows-2kp)

## Preferences
- ELK compound nodes: child node coordinates are relative to parent's top-left, not absolute. Compute absolute positions as `parentX + child.x, parentY + child.y` (added: 2026-02-28, dispatch: multi-human-workflows-apz)
- Use scoped ID convention (`aggregate::eventName`) for domain event nodes inside compound groups to prevent ID collisions (added: 2026-02-28, dispatch: multi-human-workflows-apz)

## Cross-Agent Notes
- (from logic) ELK returns top-left (x,y) not center; use `_nodeCx`/`_nodeCy` helpers when computing edge endpoints or zoom targets (added: 2026-02-28)
- SVG `pointer-events` must be applied via `style=` attribute in Lit svg templates, not as a bare attribute (added: 2026-02-28, dispatch: multi-human-workflows-5ku)
- Edge filter helpers extracted to `src/lib/edge-filters.ts` — pure functions `isEdgeVisible`/`isEdgeGroupVisible` (added: 2026-02-28, dispatch: multi-human-workflows-5ku)
- SVG `<textPath startOffset="50%" text-anchor="middle">` with `paint-order="stroke"` creates readable labels along curved paths (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
- SVG marker `markerUnits="strokeWidth"` scales arrowheads relative to stroke width for crisp zoom-invariant arrows (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
- ELK edge sections: `laid.edges[].sections[].{startPoint, endPoint, bendPoints}` — track edge ID to group key to retrieve sections after layout (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
