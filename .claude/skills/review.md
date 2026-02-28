# /review -- Structured Code Review

Review code changes for correctness, style, and architectural fit.

## Usage

`/review [file-or-diff]`

## Checklist

1. **Correctness**: Does the code do what it claims? Edge cases handled?
2. **Types**: Are TypeScript types accurate and specific (no `any`)?
3. **Architecture**: Does it respect layer boundaries (schema -> lib -> state -> components)?
4. **Tests**: Are new behaviors covered by tests? Are tests in the right location?
5. **Imports**: Using `.js` extensions? Per-component Shoelace imports?
6. **Style**: Consistent with existing patterns in the codebase?

## Output

List findings as: `[severity] file:line -- description`

Severities: MUST (blocking), SHOULD (important), NICE (optional)
