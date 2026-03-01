# Learnings: component

## Codebase Patterns
- One custom element per file, registered via `@customElement('tag-name')` decorator
- Shoelace components imported per-component (tree-shaking, not full bundle)
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig (required for Lit)
- Components organized by domain feature: shared/, session/, artifact/, comparison/, visualization/ under src/components/ (added: 2026-02-28, dispatch: a6r.12)

## Gotchas
- Shoelace `sl-change` event: `e.target` is `SlSelect` not `HTMLSelectElement`; cast via `(e.target as unknown as { value: string }).value` (added: 2026-02-28)
- SVG `@dblclick` on `<g>` propagates to parent click handlers — use `e.stopPropagation()` (added: 2026-02-28)
- When a node appears in `nodes[]` for edge routing but needs special rendering, keep a separate list and filter from regular render loop (added: 2026-02-28)

## Session Patterns
- app-shell.ts uses `_soloMode` boolean @state to switch between session-lobby and file-drop-zone hero landing (added: 2026-02-28, dispatch: multi-human-workflows-zgg)
- EventSource (SSE) in Lit: connect in method, call close() in disconnectedCallback, store as private field not @state to avoid re-renders (added: 2026-02-28, dispatch: multi-human-workflows-zgg)

## Accessibility
- SVG keyboard navigation: add `tabindex="0"`, `role="application"`, `aria-label`, `aria-activedescendant` to the SVG element; use `role="img"` and `aria-label` on node `<g>` elements (added: 2026-02-28, dispatch: multi-human-workflows-jus)
- Roving tabindex pattern for graph: build adjacency map from edges, use ArrowRight/Down (+1) and ArrowLeft/Up (-1) to traverse, Enter/Space to activate, Escape to clear focus (added: 2026-02-28, dispatch: multi-human-workflows-jus)
- For panels that slide in/out: `aria-hidden` toggling + focus-on-open (createRef) + restore-on-close; `aria-modal="false"` when page still accessible behind panel (added: 2026-02-28, dispatch: a6r.30)
- Shoelace `sl-details` already provides keyboard expand/collapse — no custom handler needed (added: 2026-02-28, dispatch: a6r.30)
- For SVG-only visualizations, use visually-hidden `<table>` as screen reader fallback rather than making SVG nodes individually focusable (added: 2026-02-28, dispatch: a6r.30)

## State Lifting
- When a Lit component manages connection lifecycle (EventSource, WebSocket), put the connection in `state/` with a module-level variable, not in the component — state persists across navigation, components focus on rendering (added: 2026-02-28, dispatch: a6r.34)
- Components subscribe to the store in `connectedCallback` and unsubscribe in `disconnectedCallback` — same lifecycle pattern as EventSource itself (added: 2026-02-28, dispatch: a6r.34)

## Reactive Controllers
- When a component needs event-type-driven side effects (not just derived values), use raw `store.subscribe` with a type filter — `StoreController` is wrong for event-driven side effects (added: 2026-02-28, dispatch: a6r.31)
- `ReactiveController.setFoo()` called from `render()` is safe if guarded by equality checks — Lit batches synchronous `requestUpdate()` within a render (added: 2026-02-28, dispatch: a6r.31)
- Store selector equality (`!==`) works correctly only when store returns new object references on mutation — `StoreController<T>` relies on this invariant (added: 2026-02-28, dispatch: a6r.31)

## Lit Property Name Gotchas
- Avoid `before`, `after`, `remove`, `append`, `prepend`, `replaceWith` as Lit @property names — they collide with Element DOM methods, causing TS2416 (added: 2026-02-28, dispatch: a6r.32)
- For recursive Lit render methods, always add explicit `: TemplateResult` return type — TypeScript cannot infer through html`` template literal tags in recursive calls (added: 2026-02-28, dispatch: a6r.32)

## Agreement Components
- Components call HTTP REST API directly (not server-side service classes) — read http.ts handler routes for wire format, not context service files (added: 2026-02-28, dispatch: a6r.28)
- Offline mode fallback: fire custom events with composed:true when no session code, let parent handle — supports both connected and standalone usage (added: 2026-02-28, dispatch: a6r.28)

## Store Data Gaps
- Check store types before assuming data from task requirements — missing fields need a schema extension task (added: 2026-02-28, dispatch: a6r.33)

## i18n
- i18n module at `src/lib/i18n.ts` — `t(key, params?)` with `{{param}}` interpolation; keys organized by component name (added: 2026-03-01, dispatch: a6r.29)
- When loop variable shadows imported `t`, rename the loop variable (e.g., `changeType` not `t`) — Lit templates call `t()` frequently (added: 2026-03-01, dispatch: a6r.29)

## Storybook
- Storybook config files (.storybook/main.ts) run as ESM — use `fileURLToPath(import.meta.url)` + `path.dirname()` instead of `__dirname` (added: 2026-03-01, dispatch: jat)
- StorybookConfig hook for Vite customization is `viteFinal` (not `viteFinalConfig`). Import the type from `@storybook/web-components-vite` to catch naming mismatches (added: 2026-03-01, dispatch: jat)
- Storybook 10 with @storybook/web-components-vite: add Tailwind CSS v4 plugin and @ path alias in `viteFinal` hook; don't duplicate vite.config.ts (added: 2026-03-01, dispatch: jat)
- Stories live in `src/stories/` (one file per component), not colocated with component source (added: 2026-03-01, dispatch: jat)

## Worktree Gotchas
- git stash pop in a worktree with concurrent branch activity can surface merge conflicts in package.json/tsconfig — use `git checkout --ours` to restore worktree state (added: 2026-03-01, dispatch: qdu)
- @storybook/web-components types not installed — story files produce TS2307; treat tsc errors in src/stories/ as pre-existing unless from new component code (added: 2026-03-01, dispatch: qdu)

## Cross-Agent Notes
- (from logic) ELK returns top-left (x,y) not center; use `_nodeCx`/`_nodeCy` helpers when computing edge endpoints or zoom targets (added: 2026-02-28)
- SVG `pointer-events` must be applied via `style=` attribute in Lit svg templates, not as a bare attribute (added: 2026-02-28, dispatch: multi-human-workflows-5ku)
- Edge filter helpers extracted to `src/lib/edge-filters.ts` — pure functions `isEdgeVisible`/`isEdgeGroupVisible` (added: 2026-02-28, dispatch: multi-human-workflows-5ku)
