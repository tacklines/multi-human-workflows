---
paths:
  - "src/**/*.ts"
---

# Architecture

## Layer Boundaries

```
schema/       Types + JSON Schema (no imports from other src/ dirs)
lib/          Pure functions (may import schema/, nothing else from src/)
state/        App store (may import schema/, nothing else from src/)
components/   Lit elements (may import lib/, state/, schema/)
fixtures/     Sample data (no code imports)
```

## Import Rules

- `schema/` must not import from `lib/`, `state/`, or `components/`
- `lib/` must not import from `state/` or `components/`
- `state/` must not import from `components/`
- All cross-module imports use `.js` extension (TypeScript ESM)

## Do This

- Keep functions in `lib/` pure -- no side effects, no DOM
- Keep the store in `state/` framework-agnostic -- no Lit imports
- Put new components in `components/`, one element per file

## New Work: Check the Design Doc

Before implementing a new feature, read the relevant phase in `docs/experience-design.md`:
- Check the **Scope** label (existing / new / enhanced) to understand what already exists
- Check the **MCP tool schemas** in the appendix for input/output contracts
- Check the **Defaults and configuration** table for settings behavior
- Ensure UI and MCP tool produce the same domain event (core rule)

## Don't Do This

- Do not import the full Shoelace bundle -- import individual components
- Do not add framework state management (Redux, MobX) -- the pub/sub store is intentional
- Do not put business logic in components -- extract to `lib/`
- Do not invent UX patterns that contradict `docs/experience-design.md`
