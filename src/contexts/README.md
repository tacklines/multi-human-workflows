# Bounded Contexts

This directory organizes the platform's domain logic into six bounded contexts following Domain-Driven Design principles. Each context owns its aggregates, events, and internal logic. Cross-context communication happens through well-defined interfaces at context boundaries.

## Contexts

| Context | Responsibility |
|---|---|
| `session/` | Session lifecycle, participant registry, session state machine |
| `artifact/` | Artifact submission, versioning, provenance tracking |
| `comparison/` | Cross-artifact comparison, overlap detection, conflict identification |
| `agreement/` | Conflict resolution, aggregate ownership assignment, unresolved item flagging |
| `contract/` | Schema generation, compliance checking, schema drift detection |
| `gateway/` | Protocol Gateway ACL — MCP, HTTP, A2A, and WebSocket access mediation |

## Design Principles

- Each context is autonomous: it owns its aggregate root and emits its own domain events.
- No context imports directly from another context's internals — only from its `index.ts` barrel.
- Shared primitives (e.g., session join codes, participant IDs) live in `src/schema/` as the neutral contract layer.
- The `gateway/` context is the sole entry point for all external protocols; it translates protocol-specific requests into domain commands.
