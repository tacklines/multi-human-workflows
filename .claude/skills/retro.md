# /retro -- Session Retrospective

Reflect on what happened in the current session before ending it.

## Usage

`/retro`

## Steps

1. Review what was accomplished (commits, files changed, beads closed)
2. Note any surprises, blockers, or learnings
3. Update `memory/MEMORY.md` if new architectural knowledge was discovered
4. Run `bd sync` to persist bead state

## Output

Write session summary to `memory/sessions/YYYY-MM-DDThh-mm-ssZ.md` with:
- Commits made
- Working tree status
- Backlog state (from `bd stats`)
- Key decisions or learnings
