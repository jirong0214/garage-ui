import { describe, expect, it } from 'vitest';

import { credentialsFromResponse } from './session-response';

describe('credentialsFromResponse', () => {
  it('maps a complete rotating device session response', () => {
    expect(
      credentialsFromResponse({
        success: true,
        token: 'access',
        refresh_token: 'refresh',
        access_token_expires_at: '2026-07-26T12:00:00Z',
        refresh_token_expires_at: '2026-08-25T12:00:00Z',
        session: { id: 'session-id' },
      }),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'session-id',
      accessTokenExpiresAt: '2026-07-26T12:00:00Z',
      refreshTokenExpiresAt: '2026-08-25T12:00:00Z',
    });
  });

  it('rejects an access-only legacy response as a device session', () => {
    expect(() =>
      credentialsFromResponse({ success: true, token: 'legacy-access' }),
    ).toThrow('valid device session');
  });
});
