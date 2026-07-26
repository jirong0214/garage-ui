import type { ModelsDeviceSessionResponse } from '@garage-ui/api-client';

export type DeviceSession = {
  id: string;
  device_name: string;
  device_platform: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  current: boolean;
};

export function toDeviceSession(value: ModelsDeviceSessionResponse): DeviceSession {
  if (
    !value.id ||
    !value.device_name ||
    !value.created_at ||
    !value.last_used_at ||
    !value.expires_at
  ) {
    throw new Error('The server returned an invalid device session.');
  }
  return {
    id: value.id,
    device_name: value.device_name,
    device_platform: value.device_platform ?? '',
    created_at: value.created_at,
    last_used_at: value.last_used_at,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at ?? null,
    current: value.current ?? false,
  };
}

export type DeviceSessionStatus = 'active' | 'expired' | 'revoked';

export function getDeviceSessionStatus(
  session: DeviceSession,
  now = Date.now(),
): DeviceSessionStatus {
  if (session.revoked_at) return 'revoked';
  const expiration = Date.parse(session.expires_at);
  if (Number.isFinite(expiration) && expiration <= now) return 'expired';
  return 'active';
}

export function sortDeviceSessions(
  sessions: readonly DeviceSession[],
  now = Date.now(),
): DeviceSession[] {
  return [...sessions].sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;

    const statusOrder =
      statusPriority(getDeviceSessionStatus(left, now)) -
      statusPriority(getDeviceSessionStatus(right, now));
    if (statusOrder !== 0) return statusOrder;

    return recentTimestamp(right) - recentTimestamp(left) || left.id.localeCompare(right.id);
  });
}

function statusPriority(status: DeviceSessionStatus): number {
  if (status === 'active') return 0;
  if (status === 'expired') return 1;
  return 2;
}

function recentTimestamp(session: DeviceSession): number {
  const lastUsed = Date.parse(session.last_used_at);
  if (Number.isFinite(lastUsed)) return lastUsed;
  const created = Date.parse(session.created_at);
  return Number.isFinite(created) ? created : 0;
}
