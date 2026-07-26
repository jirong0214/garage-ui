import type { ModelsLoginResponse } from '@garage-ui/api-client';

import { ApiError } from '../../../../infrastructure/api/api-error';

import type { SessionCredentials } from './session-credentials';

export function credentialsFromResponse(body: ModelsLoginResponse): SessionCredentials {
  if (
    !body.success ||
    !body.token ||
    !body.refresh_token ||
    !body.session?.id ||
    !body.access_token_expires_at ||
    !body.refresh_token_expires_at
  ) {
    throw new ApiError('The server did not return a valid device session.');
  }
  return {
    accessToken: body.token,
    refreshToken: body.refresh_token,
    sessionId: body.session.id,
    accessTokenExpiresAt: body.access_token_expires_at,
    refreshTokenExpiresAt: body.refresh_token_expires_at,
  };
}
