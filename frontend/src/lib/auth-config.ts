// Default is for local dev with Keycloak. Production sets VITE_AUTH_AUTHORITY at build time.
const AUTH_AUTHORITY = (import.meta as any).env?.VITE_AUTH_AUTHORITY ?? 'http://localhost:8081/realms/seam';
const APP_URL = (import.meta as any).env?.VITE_APP_URL ?? 'http://localhost:5173';

export const AUTH_CONFIG = {
  authority: AUTH_AUTHORITY,
  client_id: 'web-app',
  redirect_uri: `${APP_URL}/auth/callback`,
  post_logout_redirect_uri: `${APP_URL}/`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  silent_redirect_uri: `${APP_URL}/auth/silent-renew.html`,
} as const;
