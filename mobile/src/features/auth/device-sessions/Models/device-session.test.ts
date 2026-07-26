import { describe, expect, it } from 'vitest';

import {
  getDeviceSessionStatus,
  sortDeviceSessions,
  toDeviceSession,
  type DeviceSession,
} from './device-session';

describe('toDeviceSession', () => {
  it('normalizes optional response fields', () => {
    expect(
      toDeviceSession({
        id: 'session',
        device_name: 'iPhone SE',
        created_at: '2026-07-26T10:00:00Z',
        last_used_at: '2026-07-26T11:00:00Z',
        expires_at: '2026-08-25T10:00:00Z',
      }),
    ).toMatchObject({
      id: 'session',
      device_platform: '',
      revoked_at: null,
      current: false,
    });
  });

  it('rejects incomplete server data', () => {
    expect(() => toDeviceSession({ id: 'session' })).toThrow('invalid device session');
  });
});

const now = Date.parse('2026-07-26T12:00:00Z');

function session(overrides: Partial<DeviceSession>): DeviceSession {
  return {
    id: 'session',
    device_name: 'iPhone',
    device_platform: 'iOS',
    created_at: '2026-01-01T00:00:00Z',
    last_used_at: '2026-07-01T00:00:00Z',
    expires_at: '2026-08-01T00:00:00Z',
    revoked_at: null,
    current: false,
    ...overrides,
  };
}

describe('getDeviceSessionStatus', () => {
  it('distinguishes active, expired, and revoked sessions', () => {
    expect(getDeviceSessionStatus(session({}), now)).toBe('active');
    expect(
      getDeviceSessionStatus(session({ expires_at: '2026-07-01T00:00:00Z' }), now),
    ).toBe('expired');
    expect(
      getDeviceSessionStatus(
        session({
          expires_at: '2026-08-01T00:00:00Z',
          revoked_at: '2026-07-20T00:00:00Z',
        }),
        now,
      ),
    ).toBe('revoked');
  });
});

describe('sortDeviceSessions', () => {
  it('places the current device first, then active sessions by recent use', () => {
    const sessions = [
      session({ id: 'revoked', revoked_at: '2026-07-20T00:00:00Z' }),
      session({ id: 'older-active', last_used_at: '2026-06-01T00:00:00Z' }),
      session({ id: 'newer-active', last_used_at: '2026-07-20T00:00:00Z' }),
      session({
        id: 'current',
        current: true,
        expires_at: '2026-07-01T00:00:00Z',
      }),
    ];

    expect(sortDeviceSessions(sessions, now).map((item) => item.id)).toEqual([
      'current',
      'newer-active',
      'older-active',
      'revoked',
    ]);
    expect(sessions.map((item) => item.id)).toEqual([
      'revoked',
      'older-active',
      'newer-active',
      'current',
    ]);
  });

  it('places expired sessions after active sessions and before revoked sessions', () => {
    expect(
      sortDeviceSessions(
        [
          session({ id: 'revoked', revoked_at: '2026-07-20T00:00:00Z' }),
          session({ id: 'expired', expires_at: '2026-07-01T00:00:00Z' }),
          session({ id: 'active' }),
        ],
        now,
      ).map((item) => item.id),
    ).toEqual(['active', 'expired', 'revoked']);
  });
});
