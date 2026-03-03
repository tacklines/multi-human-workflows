# Epic: Complete Seam UX — gap analysis and implementation

**Epic ID**: multi-human-workflows-llab
**Created**: 2026-03-03
**Source**: /blossom
**Goal**: Analyze gap between docs/experience-design.md and current implementation. Focus areas: UX flow completeness, phase blending transitions, suggestion bar, empty states, branding, onboarding, missing UI wiring.

## Spike Findings

### Items

1. **Wire requirements-panel into app-shell sidebar** — Component exists (258 lines, fully implemented) but is never rendered. Core to requirements-driven funnel.
   - source: src/components/session/requirements-panel.ts
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: none
   - agent: component

2. **Wire derivation-review-panel into spark-canvas flow** — Component exists (fully implemented) but never rendered. Required for Spark→Explore transition.
   - source: src/components/session/derivation-review-panel.ts
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: llab.8
   - agent: component

3. **Fix e2e tests for Seam branding** — 3 e2e test files still assert "Storm-Prep Visualizer" but app renders "Seam"
   - source: e2e/
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: none
   - agent: test-generator

4. **Add help-tip wrappers to remaining phase views** — ~6 views missing help-tip component wrappers despite i18n keys existing
   - source: src/components/
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: none
   - agent: component

5. **Expand domain-tooltip usage across views** — Domain-specific terms appear without tooltip wrappers in several components
   - source: src/components/
   - confidence: LIKELY
   - priority: P2
   - depends-on: none
   - agent: component

6. **Update documentation branding to Seam** — docs/ still references "storm-prep" in places
   - source: docs/
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: none
   - agent: general-purpose

7. **Implement phase-navigate keyboard shortcuts scroll behavior** — Phase-navigate events dispatch but may not scroll to target
   - source: src/components/shared/app-shell.ts
   - confidence: LIKELY
   - priority: P2
   - depends-on: none
   - agent: component

8. **Add Storybook story for onboarding-overlay** — No story exists for interactive testing of onboarding flow
   - source: src/components/
   - confidence: CONFIRMED
   - priority: P3
   - depends-on: none
   - agent: component

9. **Standardize help-tip i18n key casing** — Inconsistent casing in helpTip i18n keys
   - source: src/lib/i18n.ts
   - confidence: CONFIRMED
   - priority: P3
   - depends-on: none
   - agent: general-purpose

## Priority Order

1. llab.8 — Wire requirements-panel into app-shell sidebar (P0)
2. llab.9 — Wire derivation-review-panel into spark-canvas flow (P0, blocked by llab.8)
3. llab.10 — Fix e2e tests for Seam branding (P1)
4. llab.11 — Add help-tip wrappers to remaining phase views (P1)
5. llab.12 — Expand domain-tooltip usage across views (P2)
6. llab.13 — Update documentation branding to Seam (P2)
7. llab.14 — Implement phase-navigate keyboard shortcuts scroll behavior (P2)
8. llab.15 — Add Storybook story for onboarding-overlay (P3)
9. llab.16 — Standardize help-tip i18n key casing (P3)

## Task IDs

| BD ID | Title | Priority | Status | Assigned Agent |
|-------|-------|----------|--------|----------------|
| llab.8 | Wire requirements-panel into app-shell sidebar | P0 | open | component — touches app-shell.ts, requirements-panel.ts |
| llab.9 | Wire derivation-review-panel into spark-canvas flow | P0 | open | component — touches app-shell.ts, derivation-review-panel.ts |
| llab.10 | Fix e2e tests for Seam branding | P1 | open | test-generator — touches e2e/*.spec.ts |
| llab.11 | Add help-tip wrappers to remaining phase views | P1 | open | component — touches ~6 component files |
| llab.12 | Expand domain-tooltip usage across views | P2 | open | component — touches multiple component files |
| llab.13 | Update documentation branding to Seam | P2 | open | general-purpose — touches docs/*.md |
| llab.14 | Implement phase-navigate keyboard shortcuts scroll behavior | P2 | open | component — touches app-shell.ts |
| llab.15 | Add Storybook story for onboarding-overlay | P3 | open | component — touches stories/ |
| llab.16 | Standardize help-tip i18n key casing | P3 | open | general-purpose — touches src/lib/i18n.ts |

## Critical Path

llab.8 (Wire requirements-panel) → llab.9 (Wire derivation-review-panel)

## Parallel Opportunities

Wave 1 (all independent): llab.8, llab.10, llab.11, llab.12, llab.13, llab.14, llab.15, llab.16
Wave 2 (after llab.8): llab.9
