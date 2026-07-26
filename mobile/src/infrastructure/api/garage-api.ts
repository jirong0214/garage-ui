import {
  createClient,
  getAuthConfig,
  getCapabilities,
  getHealth,
  listBuckets,
  listObjects,
  login,
  type ModelsAuthConfigResponse,
  type ModelsBucketInfo,
  type ModelsCapabilitiesResponse,
  type ModelsHealthResponse,
  type ModelsObjectListResponse,
} from '@garage-ui/api-client';

import { authStorage } from '@/features/auth/session/auth-storage';
import { credentialsFromResponse } from '@/features/auth/session/Models/session-response';
import { currentDeviceSessionDescription } from '@/features/auth/session/Services/device-description-service';
import {
  authenticatedClient,
  authorizationHeaders,
} from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';

import { toApiError } from './api-error';

type Result<T> = { data?: T; error?: unknown; response?: Response };

function unwrap<T>(result: Result<T>): T {
  if (result.error || !result.data || !result.response?.ok) {
    throw toApiError(result.error, result.response);
  }
  return result.data;
}

function client(baseUrl: string) {
  return createClient({ baseUrl });
}

export async function testServer(baseUrl: string): Promise<{
  health: ModelsHealthResponse;
  authConfig: ModelsAuthConfigResponse;
}> {
  const api = client(baseUrl);
  const [healthResult, authResult] = await Promise.all([
    getHealth({ client: api }),
    getAuthConfig({ client: api }),
  ]);
  const healthEnvelope = unwrap(healthResult);
  const authConfig = unwrap(authResult);
  if (!healthEnvelope.success || !healthEnvelope.data) {
    throw toApiError(healthEnvelope, healthResult.response);
  }
  if (!authConfig.admin?.enabled) {
    throw toApiError({ message: 'Username and password login is not enabled on this server.' });
  }
  return { health: healthEnvelope.data, authConfig };
}

export async function signIn(profile: ServerProfile, username: string, password: string): Promise<void> {
  const device = currentDeviceSessionDescription();
  const result = await login({
    client: client(profile.baseUrl),
    body: {
      username,
      password,
      device_name: device.deviceName,
      device_platform: device.devicePlatform,
    },
  });
  const body = unwrap(result);
  if (!body.success || !body.token) {
    throw toApiError({ message: 'The server did not return a valid session.' }, result.response);
  }
  if (body.refresh_token) {
    await authStorage.setSession(profile.id, credentialsFromResponse(body));
  } else {
    await authStorage.setToken(profile.id, body.token);
  }
}

export async function fetchCapabilities(profile: ServerProfile): Promise<ModelsCapabilitiesResponse> {
  const result = await getCapabilities({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
  });
  const envelope = unwrap(result);
  if (!envelope.success || !envelope.data) throw toApiError(envelope, result.response);
  return envelope.data;
}

export async function fetchBuckets(profile: ServerProfile): Promise<ModelsBucketInfo[]> {
  const result = await listBuckets({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
  });
  const envelope = unwrap(result);
  if (!envelope.success || !envelope.data) throw toApiError(envelope, result.response);
  return envelope.data.buckets ?? [];
}

export async function fetchObjects(
  profile: ServerProfile,
  bucket: string,
  options: {
    prefix?: string;
    search?: string;
    maxKeys?: number;
    continuationToken?: string;
  } = {},
): Promise<ModelsObjectListResponse> {
  const result = await listObjects({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { bucket },
    query: {
      prefix: options.prefix ?? '',
      search: options.search || undefined,
      max_keys: options.maxKeys ?? 50,
      continuation_token: options.continuationToken || undefined,
    },
  });
  const envelope = unwrap(result);
  if (!envelope.success || !envelope.data) throw toApiError(envelope, result.response);
  return envelope.data;
}
