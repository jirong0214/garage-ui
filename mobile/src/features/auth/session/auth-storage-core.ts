export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const tokenKey = (serverId: string) => `garage-ui.session.${serverId}.jwt`;

export class AuthStorage {
  constructor(private readonly store: SecureKeyValueStore) {}

  getToken(serverId: string): Promise<string | null> {
    return this.store.getItemAsync(tokenKey(serverId));
  }

  async setToken(serverId: string, token: string): Promise<void> {
    if (!token.trim()) throw new Error('Refusing to store an empty session token.');
    await this.store.setItemAsync(tokenKey(serverId), token);
  }

  clearToken(serverId: string): Promise<void> {
    return this.store.deleteItemAsync(tokenKey(serverId));
  }
}
