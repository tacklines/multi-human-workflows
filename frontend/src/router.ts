import { Router } from '@vaadin/router';

let router: Router | null = null;

export function initRouter(outlet: HTMLElement): Router {
  router = new Router(outlet);
  router.setRoutes([
    { path: '/', redirect: '/projects' },
    {
      path: '/projects',
      component: 'project-list',
      action: async () => { await import('./components/project/project-list.js'); },
    },
    {
      path: '/projects/:id',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/projects/:id/:tab',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/projects/:id/tasks/:ticketId',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/projects/:id/plans/:planId',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/projects/:id/agents/:agentId',
      component: 'project-workspace',
      action: async () => { await import('./components/project/project-workspace.js'); },
    },
    {
      path: '/sessions/:code',
      component: 'session-lobby',
      action: async () => { await import('./components/session/session-lobby.js'); },
    },
    {
      path: '/sessions/:code/tasks/:ticketId',
      component: 'session-lobby',
      action: async () => { await import('./components/session/session-lobby.js'); },
    },
  ]);
  return router;
}

export function getRouter(): Router | null {
  return router;
}

export function navigateTo(path: string): void {
  Router.go(path);
}
