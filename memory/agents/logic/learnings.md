# Learnings: logic

## Codebase Patterns
- Pure functions in `src/lib/` -- no DOM dependencies, data in / data out
- Tests colocated: `src/lib/foo.ts` -> `src/lib/foo.test.ts`
- YAML loading uses js-yaml, validation uses Ajv with ajv-formats
- ELK.js replaces d3-force for layered (Sugiyama) layout in flow diagram (added: 2026-02-28, dispatch: multi-human-workflows-3tm)
- Use `elkjs/lib/elk.bundled.js` import (works in browser and vitest; worker version doesn't) (added: 2026-02-28, dispatch: multi-human-workflows-3tm)
- ELK returns top-left (x,y) coordinates; use helper methods `_nodeCx`/`_nodeCy` for center coords (added: 2026-02-28, dispatch: multi-human-workflows-3tm)

## Gotchas
- ELK layered algorithm rejects self-loop edges; filter them before layout, handle separately in rendering (added: 2026-02-28, dispatch: multi-human-workflows-3tm)
- BFS: always seed visited set with start node to handle self-loops/cycles naturally; remove start from results at the end (added: 2026-02-28, dispatch: multi-human-workflows-3qx)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
