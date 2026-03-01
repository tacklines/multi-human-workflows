# User Experience

The authoritative UX specification is **`docs/experience-design.md`**. These rules are the principles; that document is the implementation guide. When they conflict, update one or the other — don't silently diverge.

## The Expanding Canvas

- The session grows as content arrives — new capabilities unlock from new artifacts, not wizard steps
- Seven UX phases (Spark, Explore, Rank, Slice, Agree, Build, Ship) are scaffolding, not gates
- The Phase Ribbon indicates progress; it never controls navigation
- Human UI actions and agent MCP calls produce identical domain events

## Design for Delight

- Every interaction should feel intentional and responsive
- Transitions and animations serve comprehension, not decoration (300-500ms, ease-in-out)
- Visual feedback on every user action: hover states, click confirmations, loading indicators
- Celebration moments when milestones are reached (respects `prefers-reduced-motion`)

## Accessibility First

- All interactive elements must be keyboard-navigable
- Color is never the sole differentiator — combine with shape, text, or pattern
- Screen reader text for icons and non-text indicators
- Touch targets minimum 44x44px for mobile

## The Technologically Inept Test

- No assumed knowledge of Event Storming, DDD, or developer tooling
- Every view must answer: "What am I looking at?" and "What can I do here?"
- Empty states with clear calls-to-action, not blank screens
- Error messages in plain language with suggested next steps
- Tooltips and contextual help for domain-specific terms

## Progressive Disclosure

- Show the simplest useful view first
- Advanced features (filters, comparison, path tracing) discoverable but not overwhelming
- Onboarding: guide new users through their first file load and exploration

## Settings Philosophy

- Sane defaults for every setting — the app works well without configuration
- Contextual gear icons per section open `sl-drawer` with only relevant settings
- Global settings dialog aggregates all settings with tabs
- Every modified setting shows a blue dot indicator; default value always visible
- Settings save immediately on change — no "Save" button
