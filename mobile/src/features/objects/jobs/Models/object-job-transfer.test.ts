import { describe, expect, it } from 'vitest';

import {
  transferCanCancel,
  transferCanRetry,
  transferProgress,
} from '../../../transfers/list/Models/transfer-record';

import { objectJobToTransferRecord } from './object-job-transfer';

describe('objectJobToTransferRecord', () => {
  it('maps an active copy job into a cancellable transfer row', () => {
    const record = objectJobToTransferRecord({
      id: 'job-1',
      operation: 'copy',
      status: 'running',
      sourceBucket: 'source',
      destinationBucket: 'target',
      processed: 4,
      discovered: 10,
      progress: 40,
    });

    expect(record).toMatchObject({
      id: 'object-job:job-1',
      resourceId: 'job-1',
      kind: 'object-job',
      direction: 'object-job',
      name: 'Copy objects',
      detail: 'source → target',
      status: 'processing',
      progressDescription: '4 / 10 objects',
    });
    expect(record && transferProgress(record)).toBe(0.4);
    expect(record && transferCanCancel(record)).toBe(true);
    expect(record && transferCanRetry(record)).toBe(false);
  });

  it('summarizes failures and prevents unsupported transfer actions', () => {
    const record = objectJobToTransferRecord({
      id: 'job-2',
      operation: 'delete',
      status: 'completed_with_errors',
      sourceBucket: 'photos',
      processed: 9,
      discovered: 10,
      failed: 1,
      skipped: 2,
    });

    expect(record).toMatchObject({
      status: 'completed_with_errors',
      errorMessage: '1 object failed',
      progressDescription: '9 / 10 objects · 1 failed · 2 skipped',
      canCancel: false,
      canRetry: false,
      canShare: false,
      canRemove: false,
    });
  });

  it('ignores malformed jobs without an identifier', () => {
    expect(objectJobToTransferRecord({ status: 'running' })).toBeNull();
  });
});
