# Project Memory

## Architecture Quick Ref

- Lit web components with TypeScript decorators (experimentalDecorators + useDefineForClassFields: false)
- Shoelace UI per-component imports, CDN base path set in index.ts
- Tailwind CSS v4 via @tailwindcss/vite plugin
- Pub/sub store in src/state/app-state.ts (no framework dependency)
- Schema contract: src/schema/candidate-events.schema.json

## Common Issues

- Ajv does not support JSON Schema draft/2020-12 by default; $schema key is stripped before compilation (see yaml-loader.ts:8)
- Shoelace base path must match the installed version (currently 2.20.1, set in src/index.ts:4)

## Agent Selection

- (pending: run agent-generator to create project agents)

## Stack Versions

- Node 24.12.0, Vite 6, Lit 3, Vitest 4, TypeScript 5.7, Tailwind CSS 4
