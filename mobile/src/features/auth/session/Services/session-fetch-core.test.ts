import { describe, expect, it, vi } from 'vitest';

import type { SessionCredentials } from '../Models/session-credentials';
import { createSessionFetch } from './session-fetch-core';

const now = Date.parse('2026-07-26T12:00:00Z');

describe('createSessionFetch', () => {
  it('refreshes shortly before expiry and sends only the rotated access token', async () => {
    const initial = credentials('old-access', '2026-07-26T12:00:30Z');
    const rotated = credentials('new-access', '2026-07-26T12:15:00Z');
    const network = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const refreshSession = vi.fn().mockResolvedValue(rotated);
    const sessionFetch = createSessionFetch({
      loadSession: vi.fn().mockResolvedValue(initial),
      refreshSession,
      fetch: network,
      now: () => now,
    });

    await sessionFetch('https://garage.example/api/v1/buckets');

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(network.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer new-access');
  });

  it('refreshes once after a 401 and retries the original request', async () => {
    const initial = credentials('old-access', '2026-07-26T12:10:00Z');
    const rotated = credentials('new-access', '2026-07-26T12:15:00Z');
    const network = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const sessionFetch = createSessionFetch({
      loadSession: vi.fn().mockResolvedValue(initial),
      refreshSession: vi.fn().mockResolvedValue(rotated),
      fetch: network,
      now: () => now,
    });

    const response = await sessionFetch('https://garage.example/api/v1/buckets');

    expect(response.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer old-access');
    expect(network.mock.calls[1][0].headers.get('Authorization')).toBe('Bearer new-access');
  });

  it('does not attempt refresh for a legacy access-only session', async () => {
    const network = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const refreshSession = vi.fn();
    const sessionFetch = createSessionFetch({
      loadSession: vi.fn().mockResolvedValue({ accessToken: 'legacy-access' }),
      refreshSession,
      fetch: network,
      now: () => now,
    });

    const response = await sessionFetch('https://garage.example/api/v1/buckets');

    expect(response.status).toBe(401);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledOnce();
  });

  it('never rotates more than once for one API request', async () => {
    const refreshSession = vi
      .fn()
      .mockResolvedValue(credentials('new-access', '2026-07-26T12:15:00Z'));
    const sessionFetch = createSessionFetch({
      loadSession: vi
        .fn()
        .mockResolvedValue(credentials('old-access', '2026-07-26T12:00:30Z')),
      refreshSession,
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
      now: () => now,
    });

    await expect(sessionFetch('https://garage.example/api/v1/buckets')).resolves.toHaveProperty(
      'status',
      401,
    );
    expect(refreshSession).toHaveBeenCalledOnce();
  });
});

function credentials(accessToken: string, accessTokenExpiresAt: string): SessionCredentials {
  return {
    accessToken,
    accessTokenExpiresAt,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: '2026-08-25T12:00:00Z',
    sessionId: 'session-id',
  };
}
