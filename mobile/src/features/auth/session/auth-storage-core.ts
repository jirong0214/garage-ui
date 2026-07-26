import type { SessionCredentials } from './Models/session-credentials';

export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const credentialsKey = (serverId: string) => `garage-ui.session.${serverId}.credentials`;
const legacyTokenKey = (serverId: string) => `garage-ui.session.${serverId}.jwt`;

export class AuthStorage {
  constructor(private readonly store: SecureKeyValueStore) {}

  async getSession(serverId: string): Promise<SessionCredentials | null> {
    const serialized = await this.store.getItemAsync(credentialsKey(serverId));
    if (serialized) {
      try {
        const value = JSON.parse(serialized) as Partial<SessionCredentials>;
        if (typeof value.accessToken === 'string' && value.accessToken.trim()) {
          return {
            accessToken: value.accessToken,
            refreshToken: optionalString(value.refreshToken),
            sessionId: optionalString(value.sessionId),
            accessTokenExpiresAt: optionalString(value.accessTokenExpiresAt),
            refreshTokenExpiresAt: optionalString(value.refreshTokenExpiresAt),
          };
        }
      } catch {
        return null;
      }
      return null;
    }

    const legacyToken = await this.store.getItemAsync(legacyTokenKey(serverId));
    return legacyToken?.trim() ? { accessToken: legacyToken } : null;
  }

  async getToken(serverId: string): Promise<string | null> {
    return (await this.getSession(serverId))?.accessToken ?? null;
  }

  async setSession(serverId: string, credentials: SessionCredentials): Promise<void> {
    if (!credentials.accessToken.trim()) {
      throw new Error('Refusing to store an empty access token.');
    }
    if (credentials.refreshToken !== undefined && !credentials.refreshToken.trim()) {
      throw new Error('Refusing to store an empty refresh token.');
    }
    await this.store.setItemAsync(credentialsKey(serverId), JSON.stringify(credentials));
    await this.store.deleteItemAsync(legacyTokenKey(serverId));
  }

  async setToken(serverId: string, token: string): Promise<void> {
    await this.setSession(serverId, { accessToken: token });
  }

  async clearToken(serverId: string): Promise<void> {
    await Promise.all([
      this.store.deleteItemAsync(credentialsKey(serverId)),
      this.store.deleteItemAsync(legacyTokenKey(serverId)),
    ]);
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
