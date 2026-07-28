import { describe, expect, it } from 'vitest';

import {
  formatTransferByteProgress,
  formatTransferBytes,
  transferCanCancel,
  transferCanRemove,
  transferCanRetry,
  transferCanShare,
  transferProgress,
  type TransferRecord,
  type TransferStatus,
} from './transfer-record';

function record(overrides: Partial<TransferRecord> = {}): TransferRecord {
  return {
    id: 'transfer-1',
    direction: 'download',
    name: 'archive.zip',
    status: 'downloading',
    transferredBytes: 512,
    totalBytes: 1024,
    ...overrides,
  };
}

describe('transferProgress', () => {
  it('returns a bounded fraction when the total size is known', () => {
    expect(transferProgress(record())).toBe(0.5);
    expect(transferProgress(record({ transferredBytes: 2048 }))).toBe(1);
    expect(transferProgress(record({ transferredBytes: -1 }))).toBe(0);
  });

  it('returns null for an unknown or invalid total size', () => {
    expect(transferProgress(record({ totalBytes: null }))).toBeNull();
    expect(transferProgress(record({ totalBytes: Number.NaN }))).toBeNull();
  });
});

describe('transfer presentation', () => {
  it('formats byte sizes and progress safely', () => {
    expect(formatTransferBytes(900)).toBe('900 B');
    expect(formatTransferBytes(1536)).toBe('1.5 KB');
    expect(formatTransferBytes(Number.NaN)).toBe('0 B');
    expect(formatTransferByteProgress(record())).toBe('512 B / 1.0 KB');
    expect(formatTransferByteProgress(record({ totalBytes: null }))).toBe('512 B');
  });

  it('exposes only actions appropriate for each status', () => {
    const active: TransferStatus[] = ['waiting', 'preparing', 'downloading', 'uploading', 'retrying'];
    const retryable: TransferStatus[] = ['failed', 'cancelled'];

    active.forEach((status) => expect(transferCanCancel(status)).toBe(true));
    retryable.forEach((status) => expect(transferCanRetry(status)).toBe(true));
    expect(transferCanShare(record({ status: 'completed' }))).toBe(true);
    expect(transferCanShare(record({ direction: 'upload', status: 'completed' }))).toBe(false);
    (['completed', 'failed', 'cancelled'] as TransferStatus[]).forEach((status) =>
      expect(transferCanRemove(status)).toBe(true),
    );

    expect(transferCanCancel('completed')).toBe(false);
    expect(transferCanRetry('downloading')).toBe(false);
    expect(transferCanShare(record({ status: 'failed' }))).toBe(false);
    expect(transferCanRemove('waiting')).toBe(false);
  });
});
