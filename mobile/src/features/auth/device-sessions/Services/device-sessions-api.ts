import {
  listDeviceSessions,
  logoutSession,
  revokeDeviceSession,
} from '@garage-ui/api-client';

import {
  authenticatedClient,
  authorizationHeaders,
} from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { toApiError } from '@/infrastructure/api/api-error';

import { toDeviceSession, type DeviceSession } from '../Models/device-session';

type Result<T> = { data?: T; error?: unknown; response?: Response };

export async function fetchDeviceSessions(profile: ServerProfile): Promise<DeviceSession[]> {
  const result = await listDeviceSessions({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
  });
  return (unwrap(result).sessions ?? []).map(toDeviceSession);
}

export async function revokeSession(profile: ServerProfile, id: string): Promise<void> {
  const result = await revokeDeviceSession({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { id },
  });
  unwrap(result);
}

export async function logoutCurrentSession(profile: ServerProfile): Promise<void> {
  const result = await logoutSession({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
  });
  unwrap(result);
}

function unwrap<T>(result: Result<T>): T {
  if (result.error || !result.data || !result.response?.ok) {
    throw toApiError(result.error, result.response);
  }
  return result.data;
}
