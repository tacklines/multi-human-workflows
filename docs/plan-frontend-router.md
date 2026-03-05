# Plan: Frontend Router Migration

## Goal
Replace manual hash-based routing with @vaadin/router to enable deep-linkable views across the app.

## Router Choice: @vaadin/router
- Mature, stable, framework-agnostic web component router
- Express-style route syntax, nested routes via `children`
- Lazy loading via `action: () => import('./component.js')`
- Route guards via `onBeforeEnter` lifecycle
- Sets `location` property on target components (params, search, etc.)
- v2.0.0 TypeScript rewrite (Nov 2024), proven in production

## Route Tree

```
/                                → redirect → /projects
/projects                        → project-list
/projects/:id                    → project-workspace (overview tab)
/projects/:id/tasks              → project-workspace (tasks tab)
/projects/:id/tasks/:ticketId    → project-workspace (task detail)
/projects/:id/graph              → project-workspace (graph tab)
/projects/:id/agents             → project-workspace (agents tab)
/projects/:id/plans              → project-workspace (plans tab)
/projects/:id/plans/:planId      → project-workspace (plan detail)
/projects/:id/sessions           → project-workspace (sessions tab)
/sessions/:code                  → session-lobby
/sessions/:code/tasks/:ticketId  → session-lobby (task detail)
/auth/callback                   → auth callback (handled before router init)
```

Key: project sub-routes render inside project-workspace as tabs/views. The router navigates to the workspace component, which reads `location.params` to determine what to show.

## Migration Steps

### Sprint 1: Router Infrastructure
1. Install @vaadin/router
2. Create `src/router.ts` — central route config, router instance, navigation helpers
3. Update `app-shell.ts` — add `<div id="outlet">` for router, remove hash parsing
4. Update `index.html` / Vite config — ensure History API fallback works
5. Convert all `window.location.hash = ...` to `Router.go(...)` calls

### Sprint 2: Component Adaptation
6. Add `location` property to routed components (project-workspace, session-lobby, project-list)
7. Update project-workspace to read route params instead of attributes
8. Update task-board to use router navigation instead of hash manipulation
9. Update session-lobby to read session code from route params
10. Update auth-state to work with path-based callback

### Sprint 3: Deep-Link Enablement
11. Add task detail deep-link routes
12. Add plan detail deep-link routes
13. Wire breadcrumb navigation using router
14. Test all routes work with browser back/forward

## Technical Notes

- Vite already has a proxy for `/api` and `/ws` — add History API fallback for all other paths
- Auth callback at `/auth/callback` must be handled before router initialization
- `Router.go('/path')` replaces `window.location.hash = '#path'`
- Components receive `location` property with `{ params, pathname, search, route }`
- Sidebar visibility can key off route prefix (`/sessions/` → show sidebar)
