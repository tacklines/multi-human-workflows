# Agent Catalog

Quick reference for which agent to dispatch for each task type.

| Agent | Purpose | Model | Invoke When |
|-------|---------|-------|-------------|
| code-reviewer | Review changes for architecture, patterns, types | sonnet | Before committing, after implementation |
| test-generator | Create/update Vitest tests for lib/ functions | sonnet | After implementing lib/ changes |
| debugger | Diagnose and fix bugs across all layers | sonnet | When something breaks or behaves unexpectedly |
| lit-component | Create or modify Lit web components | sonnet | When adding/changing UI components |
| schema-evolve | Evolve JSON Schema + cascade to types/consumers | sonnet | When the storm-prep YAML contract changes |
| rust-backend | Build Rust backend services, APIs, persistence | sonnet | When adding/changing backend endpoints, domain logic, or data storage |

## Agent Capabilities Matrix

| Agent | Reads Code | Writes Code | Runs Tests | Runs Build | Uses Beads |
|-------|-----------|-------------|-----------|-----------|-----------|
| code-reviewer | Y | N | Y | N | Y |
| test-generator | Y | Y | Y | N | Y |
| debugger | Y | Y | Y | Y | Y |
| lit-component | Y | Y | N | N | Y |
| schema-evolve | Y | Y | Y | Y | Y |
| rust-backend | Y | Y | Y | Y | Y |

## Common Workflows

### New Feature (pure logic)
1. Implement in `src/lib/`
2. `test-generator` -- Write colocated tests
3. `code-reviewer` -- Verify layer boundaries and conventions

### New Feature (UI component)
1. `lit-component` -- Create the component in `src/components/`
2. `test-generator` -- Test any new lib/ functions it depends on
3. `code-reviewer` -- Final review

### Schema Change
1. `schema-evolve` -- Modify schema, types, and all downstream consumers
2. `test-generator` -- Update test helpers and add coverage for new fields
3. `code-reviewer` -- Review the full cascade

### Bug Fix
1. `debugger` -- Diagnose root cause, write failing test, apply fix
2. `code-reviewer` -- Review the fix

### New Backend Feature
1. `rust-backend` -- Implement API endpoint + domain logic + persistence
2. `code-reviewer` -- Review the implementation
3. `lit-component` -- Wire frontend to new endpoint (if UI needed)

### Schema Change (with Backend)
1. `schema-evolve` -- Modify JSON Schema + frontend types
2. `rust-backend` -- Update Rust types to match new schema
3. `test-generator` -- Update frontend tests
4. `code-reviewer` -- Review the full cascade

### Cross-Role Comparison Enhancement
1. Implement new overlap detection in `src/lib/comparison.ts`
2. `test-generator` -- Add comparison test cases
3. `lit-component` -- Update `comparison-view` to render new overlap kinds
4. `code-reviewer` -- Final review
