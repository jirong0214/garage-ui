export type SessionCredentials = {
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
};
