import { describe, expect, it } from 'vitest';

import type { TransferRow } from './transfer-queue-core';
import { mapTransferRow, TransferQueueRepository } from './transfer-queue-core';

const row: TransferRow = {
  id: 'transfer-1',
  direction: 'download',
  state: 'downloading',
  server_id: 'server-1',
  bucket: 'photos',
  object_key: '旅行/海边 #1.jpg',
  file_name: '海边 #1.jpg',
  local_uri: 'file:///downloads/photo.jpg',
  bytes_transferred: 512,
  bytes_total: 1024,
  attempt_count: 1,
  error_code: null,
  error_message: null,
  created_at: '2026-07-27T01:00:00.000Z',
  updated_at: '2026-07-27T01:01:00.000Z',
  started_at: '2026-07-27T01:00:10.000Z',
  finished_at: null,
};

describe('transfer row mapping', () => {
  it('maps database fields without transforming object keys', () => {
    expect(mapTransferRow(row)).toEqual({
      id: 'transfer-1',
      direction: 'download',
      state: 'downloading',
      serverId: 'server-1',
      bucket: 'photos',
      key: '旅行/海边 #1.jpg',
      fileName: '海边 #1.jpg',
      localUri: 'file:///downloads/photo.jpg',
      bytesTransferred: 512,
      bytesTotal: 1024,
      attemptCount: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-27T01:00:00.000Z',
      updatedAt: '2026-07-27T01:01:00.000Z',
      startedAt: '2026-07-27T01:00:10.000Z',
      finishedAt: null,
    });
  });

  it('rejects unknown persisted enum values', () => {
    expect(() => mapTransferRow({ ...row, state: 'paused' })).toThrow(
      'Unknown transfer state',
    );
    expect(() => mapTransferRow({ ...row, direction: 'remote-copy' })).toThrow(
      'Unknown transfer direction',
    );
  });
});

describe('TransferQueueRepository', () => {
  it('creates a waiting transfer without credential-shaped persistence fields', async () => {
    const calls: unknown[][] = [];
    const repository = new TransferQueueRepository(
      {
        getFirstAsync: async () => null,
        getAllAsync: async () => [],
        runAsync: async (sql, ...parameters) => {
          calls.push([sql, ...parameters]);
          return { changes: 1 };
        },
      },
      () => '2026-07-27T02:00:00.000Z',
    );

    const record = await repository.create({
      id: 'transfer-2',
      direction: 'download',
      serverId: 'server-1',
      bucket: 'photos',
      key: 'camera/photo.jpg',
      fileName: 'photo.jpg',
      bytesTotal: 2048,
    });

    expect(record).toMatchObject({
      state: 'waiting',
      bytesTransferred: 0,
      bytesTotal: 2048,
      attemptCount: 0,
      createdAt: '2026-07-27T02:00:00.000Z',
    });
    expect(String(calls[0][0])).not.toMatch(/token|credential|presigned/i);
  });

  it('only removes terminal history for one server', async () => {
    const calls: unknown[][] = [];
    const repository = new TransferQueueRepository({
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      runAsync: async (sql, ...parameters) => {
        calls.push([sql, ...parameters]);
        return { changes: 3 };
      },
    });

    await expect(repository.removeHistory('server-1')).resolves.toBe(3);
    expect(String(calls[0][0])).toContain("'completed', 'failed', 'cancelled'");
    expect(calls[0][1]).toBe('server-1');
  });

  it('removes one terminal transfer with a state guard', async () => {
    const calls: unknown[][] = [];
    const repository = new TransferQueueRepository({
      getFirstAsync: async <T>() => ({ ...row, state: 'completed' }) as T,
      getAllAsync: async () => [],
      runAsync: async (sql, ...parameters) => {
        calls.push([sql, ...parameters]);
        return { changes: 1 };
      },
    });

    await expect(repository.remove(row.id)).resolves.toBeUndefined();
    expect(String(calls[0][0])).toContain('WHERE id = ? AND state = ?');
    expect(calls[0].slice(1)).toEqual([row.id, 'completed']);
  });

  it('does not remove an active transfer', async () => {
    const repository = new TransferQueueRepository({
      getFirstAsync: async <T>() => row as T,
      getAllAsync: async () => [],
      runAsync: async () => {
        throw new Error('runAsync should not be called');
      },
    });

    await expect(repository.remove(row.id)).rejects.toThrow('Cannot remove active transfer');
  });
});
