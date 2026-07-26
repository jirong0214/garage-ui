import {
  createClient,
  refreshSession,
  type Client,
} from '@garage-ui/api-client';

import type { ServerProfile } from '@/features/server/configuration/server-model';
import { ApiError, toApiError } from '@/infrastructure/api/api-error';

import type { SessionCredentials } from '../Models/session-credentials';
import { credentialsFromResponse } from '../Models/session-response';
import { authStorage } from '../auth-storage';
import { useSessionStore } from '../session-store';
import { RefreshSingleFlight } from './refresh-single-flight';
import { createSessionFetch } from './session-fetch-core';

type Result<T> = { data?: T; error?: unknown; response?: Response };

const refreshSingleFlight = new RefreshSingleFlight();

export function authenticatedClient(profile: ServerProfile): Client {
  return createClient({
    baseUrl: profile.baseUrl,
    fetch: authenticatedFetch(profile),
  });
}

export function authenticatedFetch(profile: ServerProfile): typeof fetch {
  return createSessionFetch({
    loadSession: () => authStorage.getSession(profile.id),
    refreshSession: () => refreshCredentials(profile),
    fetch: (request) => globalThis.fetch(request),
    now: () => Date.now(),
  }) as typeof fetch;
}

export async function authorizationHeaders(
  profile: ServerProfile,
): Promise<Record<string, string>> {
  const credentials = await usableCredentials(profile);
  return { Authorization: `Bearer ${credentials.accessToken}` };
}

export function refreshCredentials(profile: ServerProfile): Promise<SessionCredentials> {
  return refreshSingleFlight.run(profile.id, async () => {
    const current = await authStorage.getSession(profile.id);
    if (!current?.refreshToken) {
      throw sessionExpiredError();
    }

    const result = await refreshSession({
      client: createClient({ baseUrl: profile.baseUrl }),
      body: { refresh_token: current.refreshToken },
    });

    try {
      const credentials = credentialsFromResponse(unwrap(result));
      await authStorage.setSession(profile.id, credentials);
      return credentials;
    } catch (error) {
      const apiError = toApiError(error, result.response);
      if (apiError.status === 400 || apiError.status === 401) {
        await invalidateLocalSession(profile.id);
      }
      throw apiError;
    }
  });
}

export async function invalidateLocalSession(serverId: string): Promise<void> {
  await authStorage.clearToken(serverId);
  useSessionStore.getState().setAuthenticated(false);
}

async function usableCredentials(profile: ServerProfile): Promise<SessionCredentials> {
  const credentials = await authStorage.getSession(profile.id);
  if (!credentials) throw sessionExpiredError();
  if (!shouldRefresh(credentials)) return credentials;
  try {
    return await refreshCredentials(profile);
  } catch (error) {
    if (isExpired(credentials)) throw error;
    return credentials;
  }
}

function unwrap<T>(result: Result<T>): T {
  if (result.error || !result.data || !result.response?.ok) {
    throw toApiError(result.error, result.response);
  }
  return result.data;
}

function shouldRefresh(credentials: SessionCredentials): boolean {
  if (!credentials.refreshToken || !credentials.accessTokenExpiresAt) return false;
  const expiresAt = Date.parse(credentials.accessTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() <= 60_000;
}

function isExpired(credentials: SessionCredentials): boolean {
  if (!credentials.accessTokenExpiresAt) return false;
  const expiresAt = Date.parse(credentials.accessTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function sessionExpiredError(): ApiError {
  return new ApiError('Your session has expired. Please sign in again.', 401, 'unauthorized');
}
