import { describe, expect, it } from 'vitest';

import { AuthStorage, type SecureKeyValueStore } from './auth-storage-core';

class MemorySecureStore implements SecureKeyValueStore {
  values = new Map<string, string>();

  async getItemAsync(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string) {
    this.values.set(key, value);
  }

  async deleteItemAsync(key: string) {
    this.values.delete(key);
  }
}

describe('AuthStorage', () => {
  it('isolates tokens by server and clears only the requested session', async () => {
    const secureStore = new MemorySecureStore();
    const storage = new AuthStorage(secureStore);
    await storage.setToken('server-a', 'token-a');
    await storage.setToken('server-b', 'token-b');

    expect(await storage.getToken('server-a')).toBe('token-a');
    await storage.clearToken('server-a');
    expect(await storage.getToken('server-a')).toBeNull();
    expect(await storage.getToken('server-b')).toBe('token-b');
    expect([...secureStore.values.keys()]).toEqual(['garage-ui.session.server-b.credentials']);
  });

  it('refuses to store empty credentials', async () => {
    const storage = new AuthStorage(new MemorySecureStore());
    await expect(storage.setToken('server-a', ' ')).rejects.toThrow('empty access token');
    await expect(
      storage.setSession('server-a', { accessToken: 'access', refreshToken: ' ' }),
    ).rejects.toThrow('empty refresh token');
  });

  it('stores the access and refresh credentials in one SecureStore value', async () => {
    const secureStore = new MemorySecureStore();
    const storage = new AuthStorage(secureStore);
    const credentials = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      sessionId: 'session-id',
      accessTokenExpiresAt: '2026-07-26T12:00:00Z',
      refreshTokenExpiresAt: '2026-08-25T12:00:00Z',
    };

    await storage.setSession('server-a', credentials);

    expect(await storage.getSession('server-a')).toEqual(credentials);
    expect([...secureStore.values.values()]).toEqual([JSON.stringify(credentials)]);
  });

  it('reads an existing access-only JWT without copying it outside SecureStore', async () => {
    const secureStore = new MemorySecureStore();
    secureStore.values.set('garage-ui.session.server-a.jwt', 'legacy-jwt');
    const storage = new AuthStorage(secureStore);

    expect(await storage.getSession('server-a')).toEqual({ accessToken: 'legacy-jwt' });
  });
});
