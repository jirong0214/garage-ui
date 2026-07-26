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
    expect([...secureStore.values.keys()]).toEqual(['garage-ui.session.server-b.jwt']);
  });

  it('refuses to store empty credentials', async () => {
    const storage = new AuthStorage(new MemorySecureStore());
    await expect(storage.setToken('server-a', ' ')).rejects.toThrow('empty session token');
  });
});
