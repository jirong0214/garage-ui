import {
  defaultBrowserPreferences,
  isBrowserSortMode,
  type BrowserPreferences,
} from '../Models/browser-preferences';

type PreferenceRow = {
  sort_mode: string;
  scroll_offset: number;
};

export interface BrowserPreferencesDatabase {
  getFirstAsync<T>(sql: string, ...parameters: (string | number)[]): Promise<T | null>;
  runAsync(sql: string, ...parameters: (string | number)[]): Promise<unknown>;
}

export class BrowserPreferencesRepository {
  constructor(private readonly database: BrowserPreferencesDatabase) {}

  async load(serverId: string, bucket: string, prefix: string): Promise<BrowserPreferences> {
    const row = await this.database.getFirstAsync<PreferenceRow>(
      `SELECT sort_mode, scroll_offset
       FROM object_browser_preferences
       WHERE server_id = ? AND bucket = ? AND prefix = ?
       LIMIT 1`,
      serverId,
      bucket,
      prefix,
    );
    if (!row) return defaultBrowserPreferences;

    return {
      sortMode: isBrowserSortMode(row.sort_mode) ? row.sort_mode : defaultBrowserPreferences.sortMode,
      scrollOffset: normalizeScrollOffset(row.scroll_offset),
    };
  }

  async save(
    serverId: string,
    bucket: string,
    prefix: string,
    preferences: BrowserPreferences,
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO object_browser_preferences
         (server_id, bucket, prefix, sort_mode, scroll_offset, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(server_id, bucket, prefix) DO UPDATE SET
         sort_mode = excluded.sort_mode,
         scroll_offset = excluded.scroll_offset,
         updated_at = excluded.updated_at`,
      serverId,
      bucket,
      prefix,
      preferences.sortMode,
      normalizeScrollOffset(preferences.scrollOffset),
      new Date().toISOString(),
    );
  }
}

export function normalizeScrollOffset(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
