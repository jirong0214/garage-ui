import * as SQLite from 'expo-sqlite';

import type { ServerProfile } from '@/features/server/configuration/server-model';

const databaseName = 'garage-ui-mobile.db';

async function database() {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS server_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      base_url TEXT NOT NULL,
      api_version TEXT,
      created_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

export async function getActiveServer(): Promise<ServerProfile | null> {
  const db = await database();
  const row = await db.getFirstAsync<{
    id: string;
    base_url: string;
    api_version: string | null;
    created_at: string;
  }>('SELECT id, base_url, api_version, created_at FROM server_profiles WHERE is_active = 1 LIMIT 1');
  return row
    ? { id: row.id, baseUrl: row.base_url, apiVersion: row.api_version, createdAt: row.created_at }
    : null;
}

export async function saveActiveServer(profile: ServerProfile): Promise<void> {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE server_profiles SET is_active = 0');
    await db.runAsync(
      `INSERT INTO server_profiles (id, base_url, api_version, created_at, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         base_url = excluded.base_url,
         api_version = excluded.api_version,
         is_active = 1`,
      profile.id,
      profile.baseUrl,
      profile.apiVersion,
      profile.createdAt,
    );
  });
}

export async function clearActiveServer(): Promise<void> {
  const db = await database();
  await db.runAsync('UPDATE server_profiles SET is_active = 0');
}
