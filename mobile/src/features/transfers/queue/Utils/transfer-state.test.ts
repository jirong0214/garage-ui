import { describe, expect, it } from 'vitest';

import {
  assertTransferStateTransition,
  isTerminalTransferState,
  normalizeTransferProgress,
} from './transfer-state';

describe('transfer state', () => {
  it('supports the download lifecycle and retry', () => {
    expect(() => assertTransferStateTransition('download', 'waiting', 'preparing')).not.toThrow();
    expect(() =>
      assertTransferStateTransition('download', 'preparing', 'downloading'),
    ).not.toThrow();
    expect(() =>
      assertTransferStateTransition('download', 'downloading', 'retrying'),
    ).not.toThrow();
    expect(() => assertTransferStateTransition('download', 'retrying', 'preparing')).not.toThrow();
    expect(() => assertTransferStateTransition('download', 'failed', 'retrying')).not.toThrow();
    expect(() => assertTransferStateTransition('download', 'cancelled', 'retrying')).not.toThrow();
  });

  it('prevents direction-incompatible and terminal transitions', () => {
    expect(() => assertTransferStateTransition('download', 'preparing', 'uploading')).toThrow(
      'download',
    );
    expect(() => assertTransferStateTransition('upload', 'preparing', 'downloading')).toThrow(
      'upload',
    );
    expect(() => assertTransferStateTransition('download', 'completed', 'preparing')).toThrow(
      'completed -> preparing',
    );
  });

  it('identifies terminal states', () => {
    expect(isTerminalTransferState('completed')).toBe(true);
    expect(isTerminalTransferState('failed')).toBe(true);
    expect(isTerminalTransferState('cancelled')).toBe(true);
    expect(isTerminalTransferState('retrying')).toBe(false);
  });
});

describe('transfer progress', () => {
  it('accepts known and unknown totals', () => {
    expect(normalizeTransferProgress(25, 100)).toEqual({
      bytesTransferred: 25,
      bytesTotal: 100,
    });
    expect(normalizeTransferProgress(25, null)).toEqual({
      bytesTransferred: 25,
      bytesTotal: null,
    });
  });

  it('rejects invalid byte counts', () => {
    expect(() => normalizeTransferProgress(-1, 10)).toThrow('bytesTransferred');
    expect(() => normalizeTransferProgress(11, 10)).toThrow('exceed');
    expect(() => normalizeTransferProgress(1.5, null)).toThrow('safe integer');
  });
});
