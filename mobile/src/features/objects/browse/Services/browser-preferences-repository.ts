import * as SQLite from 'expo-sqlite';

import type { BrowserPreferences } from '../Models/browser-preferences';
import { BrowserPreferencesRepository } from './browser-preferences-core';

const databaseName = 'garage-ui-mobile.db';

async function database() {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS object_browser_preferences (
      server_id TEXT NOT NULL,
      bucket TEXT NOT NULL,
      prefix TEXT NOT NULL,
      sort_mode TEXT NOT NULL DEFAULT 'name',
      scroll_offset REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (server_id, bucket, prefix)
    );
  `);
  return db;
}

export async function loadBrowserPreferences(
  serverId: string,
  bucket: string,
  prefix: string,
): Promise<BrowserPreferences> {
  const db = await database();
  return new BrowserPreferencesRepository(db).load(serverId, bucket, prefix);
}

export async function saveBrowserPreferences(
  serverId: string,
  bucket: string,
  prefix: string,
  preferences: BrowserPreferences,
): Promise<void> {
  const db = await database();
  await new BrowserPreferencesRepository(db).save(serverId, bucket, prefix, preferences);
}
