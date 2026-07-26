import { describe, expect, it } from 'vitest';

import {
  BrowserPreferencesRepository,
  type BrowserPreferencesDatabase,
  normalizeScrollOffset,
} from './browser-preferences-core';

class MemoryPreferencesDatabase implements BrowserPreferencesDatabase {
  readonly rows = new Map<string, { sort_mode: string; scroll_offset: number }>();

  async getFirstAsync<T>(_sql: string, serverId: string | number, bucket: string | number, prefix: string | number) {
    return (this.rows.get(this.key(serverId, bucket, prefix)) as T | undefined) ?? null;
  }

  async runAsync(_sql: string, ...parameters: (string | number)[]) {
    const [serverId, bucket, prefix, sortMode, scrollOffset] = parameters;
    this.rows.set(this.key(serverId, bucket, prefix), {
      sort_mode: String(sortMode),
      scroll_offset: Number(scrollOffset),
    });
  }

  private key(...parts: (string | number)[]) {
    return parts.map(String).join('\u0000');
  }
}

describe('BrowserPreferencesRepository', () => {
  it('isolates browser state by server, bucket, and prefix', async () => {
    const database = new MemoryPreferencesDatabase();
    const repository = new BrowserPreferencesRepository(database);
    await repository.save('server-a', 'photos', '2026/', { sortMode: 'date', scrollOffset: 248.5 });
    await repository.save('server-a', 'photos', '2025/', { sortMode: 'size', scrollOffset: 90 });

    await expect(repository.load('server-a', 'photos', '2026/')).resolves.toEqual({
      sortMode: 'date',
      scrollOffset: 248.5,
    });
    await expect(repository.load('server-a', 'photos', '2025/')).resolves.toEqual({
      sortMode: 'size',
      scrollOffset: 90,
    });
    await expect(repository.load('server-b', 'photos', '2026/')).resolves.toEqual({
      sortMode: 'name',
      scrollOffset: 0,
    });
  });

  it('falls back safely for invalid persisted state', async () => {
    const database = new MemoryPreferencesDatabase();
    database.rows.set('server-a\u0000bucket\u0000', {
      sort_mode: 'unknown',
      scroll_offset: -20,
    });

    await expect(new BrowserPreferencesRepository(database).load('server-a', 'bucket', '')).resolves.toEqual({
      sortMode: 'name',
      scrollOffset: 0,
    });
  });
});

describe('normalizeScrollOffset', () => {
  it('rejects invalid offsets', () => {
    expect(normalizeScrollOffset(248.5)).toBe(248.5);
    expect(normalizeScrollOffset(-10)).toBe(0);
    expect(normalizeScrollOffset(Number.NaN)).toBe(0);
    expect(normalizeScrollOffset(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
