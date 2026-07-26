import type { SessionCredentials } from '../Models/session-credentials';

export type SessionFetchDependencies = {
  loadSession(): Promise<SessionCredentials | null>;
  refreshSession(): Promise<SessionCredentials>;
  fetch(request: Request): Promise<Response>;
  now(): number;
};

const refreshLeewayMilliseconds = 60_000;

export function createSessionFetch(dependencies: SessionFetchDependencies) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const original = new Request(input, init);
    let credentials = await dependencies.loadSession();
    let didRefresh = false;
    if (!credentials) throw new Error('Your session has expired. Please sign in again.');

    if (shouldRefresh(credentials, dependencies.now())) {
      try {
        credentials = await dependencies.refreshSession();
        didRefresh = true;
      } catch (error) {
        if (isExpired(credentials, dependencies.now())) throw error;
      }
    }

    const authorized = withBearerToken(original, credentials.accessToken);
    const retryTemplate = authorized.clone();
    const response = await dependencies.fetch(authorized);
    if (response.status !== 401 || !credentials.refreshToken || didRefresh) return response;

    const refreshed = await dependencies.refreshSession();
    return dependencies.fetch(withBearerToken(retryTemplate, refreshed.accessToken));
  };
}

function shouldRefresh(credentials: SessionCredentials, now: number): boolean {
  if (!credentials.refreshToken || !credentials.accessTokenExpiresAt) return false;
  const expiresAt = Date.parse(credentials.accessTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt - now <= refreshLeewayMilliseconds;
}

function isExpired(credentials: SessionCredentials, now: number): boolean {
  if (!credentials.accessTokenExpiresAt) return false;
  const expiresAt = Date.parse(credentials.accessTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function withBearerToken(request: Request, accessToken: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return new Request(request, { headers });
}
