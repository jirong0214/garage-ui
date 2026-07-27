import * as SQLite from 'expo-sqlite';

import type {
  CreateTransferInput,
  TransferProgress,
  TransferRecord,
  TransferStateUpdate,
} from '../Models/transfer-record';
import { TransferQueueRepository } from './transfer-queue-core';

const databaseName = 'garage-ui-mobile.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(databaseName).then(async (db) => {
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transfer_queue (
      id TEXT PRIMARY KEY NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('download', 'upload')),
      state TEXT NOT NULL CHECK (
        state IN (
          'waiting', 'preparing', 'downloading', 'uploading',
          'retrying', 'completed', 'failed', 'cancelled'
        )
      ),
      server_id TEXT NOT NULL,
      bucket TEXT NOT NULL,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      local_uri TEXT,
      bytes_transferred INTEGER NOT NULL DEFAULT 0 CHECK (bytes_transferred >= 0),
      bytes_total INTEGER CHECK (bytes_total IS NULL OR bytes_total >= 0),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS transfer_queue_server_updated
      ON transfer_queue (server_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS transfer_queue_server_state
      ON transfer_queue (server_id, state);
    `);
    return db;
  });
  return databasePromise;
}

async function repository(): Promise<TransferQueueRepository> {
  return new TransferQueueRepository(await database());
}

export async function createTransfer(input: CreateTransferInput): Promise<TransferRecord> {
  return (await repository()).create(input);
}

export async function listTransfers(serverId: string): Promise<TransferRecord[]> {
  return (await repository()).list(serverId);
}

export async function getTransfer(id: string): Promise<TransferRecord | null> {
  return (await repository()).get(id);
}

export async function updateTransferProgress(
  id: string,
  progress: TransferProgress,
): Promise<void> {
  await (await repository()).updateProgress(id, progress);
}

export async function updateTransferState(
  id: string,
  update: TransferStateUpdate,
): Promise<void> {
  await (await repository()).updateState(id, update);
}

export async function removeTransferHistory(serverId: string): Promise<number> {
  return (await repository()).removeHistory(serverId);
}

export async function removeTransfer(id: string): Promise<void> {
  await (await repository()).remove(id);
}
