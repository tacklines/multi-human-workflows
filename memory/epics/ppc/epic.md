# Epic: Formalize unresolved items — explicit events and missing endpoints

**Epic ID**: multi-human-workflows-ppc
**Created**: 2026-02-28
**Source**: /blossom
**Goal**: Convert 5 unresolved /formalize items into explicit event types and exposed endpoints

## Spike Findings

1. **Add WorkflowPhaseTransitioned SSE broadcast on session mutations** — no SSE broadcast when phase changes
   - source: src/server/http.ts
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: ppc.2
   - agent: general-purpose

2. **Compute prior phase on each mutation to detect transitions** — inferPhase() called but prior phase never captured
   - source: src/lib/workflow-engine.ts, src/server/http.ts
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: none
   - agent: general-purpose

3. **Add workflow phase indicator component to session-lobby** — no visual phase display exists
   - source: src/components/session-lobby.ts
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: ppc.4
   - agent: lit-component

4. **Session-lobby listen for SSE workflow-phase events** — only listens for participant/submission
   - source: src/components/session-lobby.ts:109-120
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: ppc.1
   - agent: lit-component

5. **Add MCP workflow_phase streaming or subscription support** — query-only, no push
   - source: src/server/mcp.ts
   - confidence: CONFIRMED
   - priority: P3
   - depends-on: none
   - agent: general-purpose

6. **Add HTTP POST /api/sessions/:code/jam/flag endpoint** — SessionStore.flagUnresolved() has no HTTP route
   - source: src/server/http.ts, src/lib/session-store.ts
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: none
   - agent: general-purpose

7. **Add SSE broadcast for flagUnresolved events** — no SSE push on flag
   - source: src/server/http.ts
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: ppc.6
   - agent: general-purpose

8. **Add MCP jam_flag tool for AI-assisted unresolved item flagging** — jam_resolve/assign exist but not flag
   - source: src/server/mcp.ts
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: none
   - agent: general-purpose

9. **Add typed event metadata to store notify() calls** — subscribers get () => void, blind to mutation type
   - source: src/state/app-state.ts
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: ppc.12
   - agent: general-purpose

10. **Remove flow-diagram _filters cache workaround** — private cache compensates for untyped notifications
    - source: src/components/flow-diagram.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: ppc.9
    - agent: lit-component

11. **Optimize Lit component re-renders with selective store subscriptions** — @state() forces full re-render
    - source: src/components/app-shell.ts, flow-diagram.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: ppc.9
    - agent: lit-component

12. **Define AppState mutation event type union** — no typed events for FileLoaded/Removed/ViewMode/Filter/Aggregate
    - source: src/state/app-state.ts
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: none
    - agent: general-purpose

13. **Add mutation audit trail to store for debugging** — trivial once typed events exist
    - source: src/state/app-state.ts
    - confidence: LIKELY
    - priority: P3
    - depends-on: ppc.9
    - agent: general-purpose

14. **Separate FileLoaded side effects from store mutation** — addFile() mixes parsing with state update
    - source: src/state/app-state.ts
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: ppc.12
    - agent: general-purpose

## Priority Order

1. ppc.6 — Add HTTP POST /jam/flag endpoint (P1, ready)
2. ppc.8 — Add MCP jam_flag tool (P1, ready)
3. ppc.12 — Define AppState mutation event type union (P2, ready, blocks 4 tasks)
4. ppc.2 — Compute prior phase detection (P2, ready, blocks 3 tasks)
5. ppc.7 — Add SSE broadcast for flag (P1, after ppc.6)
6. ppc.9 — Add typed event metadata to notify() (P2, after ppc.12)
7. ppc.14 — Separate FileLoaded side effects (P2, after ppc.12)
8. ppc.1 — Add phase transition SSE broadcast (P2, after ppc.2)
9. ppc.10 — Remove _filters workaround (P1, after ppc.9)
10. ppc.11 — Optimize Lit re-renders (P1, after ppc.9)
11. ppc.4 — Lobby listen for phase SSE (P2, after ppc.1)
12. ppc.3 — Phase indicator component (P1, after ppc.4)
13. ppc.13 — Mutation audit trail (P3, after ppc.9)
14. ppc.5 — MCP phase streaming (P3, ready)

## Task IDs

| BD ID | Title | Priority | Status | Assigned Agent |
|-------|-------|----------|--------|----------------|
| ppc.2 | Compute prior phase on each mutation | P2 | closed (5f78d46) | logic |
| ppc.1 | Add WorkflowPhaseTransitioned SSE broadcast | P2 | open | general-purpose |
| ppc.4 | Session-lobby listen for SSE workflow-phase events | P2 | open | lit-component |
| ppc.3 | Add workflow phase indicator component | P1 | open | lit-component |
| ppc.5 | Add MCP workflow_phase streaming support | P3 | closed (e45a672) | architect |
| ppc.6 | Add HTTP POST /jam/flag endpoint | P1 | closed (8d704b8) | logic |
| ppc.7 | Add SSE broadcast for flagUnresolved | P1 | closed (8d704b8) | logic |
| ppc.8 | Add MCP jam_flag tool | P1 | closed (e45a672) | architect |
| ppc.12 | Define AppState mutation event type union | P2 | closed (e600fb8) | architect |
| ppc.9 | Add typed event metadata to notify() | P2 | open | general-purpose |
| ppc.10 | Remove flow-diagram _filters workaround | P1 | open | lit-component |
| ppc.11 | Optimize Lit component re-renders | P1 | open | lit-component |
| ppc.13 | Add mutation audit trail | P3 | open | general-purpose |
| ppc.14 | Separate FileLoaded side effects | P2 | open | general-purpose |

## Critical Path

ppc.12 -> ppc.9 -> ppc.11 (Define types -> Wire into notify -> Optimize components)

This is the longest chain at 3 tasks deep. The phase transition chain (ppc.2 -> ppc.1 -> ppc.4 -> ppc.3) is 4 tasks but each is small scope.

## Parallel Opportunities

Wave 1 (all ready now — no dependencies):
- ppc.6 (flag endpoint) + ppc.8 (MCP flag) + ppc.12 (type union) + ppc.2 (prior phase) + ppc.5 (MCP streaming)

Wave 2 (after Wave 1):
- ppc.7 (flag SSE) + ppc.9 (typed notify) + ppc.14 (side effects) + ppc.1 (phase SSE)

Wave 3 (after Wave 2):
- ppc.10 (_filters removal) + ppc.11 (re-render optimization) + ppc.4 (lobby listener) + ppc.13 (audit trail)

Wave 4 (after Wave 3):
- ppc.3 (phase indicator component)
