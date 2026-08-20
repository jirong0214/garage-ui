import type {
  TransferRecord,
  TransferStatus,
} from '../../../transfers/list/Models/transfer-record';

import type { ObjectJob, ObjectJobOperation } from './object-job';
import { objectJobCanCancel } from './object-job';

export type ObjectJobTransferLabels = {
  unknownBucket: string;
  copyObjects: string;
  moveObjects: string;
  deleteObjects: string;
  objectOperation: string;
  objectFailed: string;
  objectsFailed: string;
  objectUnits: string;
  failed: string;
  skipped: string;
};

const englishLabels: ObjectJobTransferLabels = {
  unknownBucket: 'Unknown bucket',
  copyObjects: 'Copy objects',
  moveObjects: 'Move objects',
  deleteObjects: 'Delete objects',
  objectOperation: 'Object operation',
  objectFailed: 'object failed',
  objectsFailed: 'objects failed',
  objectUnits: 'objects',
  failed: 'failed',
  skipped: 'skipped',
};

export function objectJobToTransferRecord(
  job: ObjectJob,
  labels: ObjectJobTransferLabels = englishLabels,
): TransferRecord | null {
  if (!job.id) return null;

  const counts = jobProgressCounts(job);
  const failed = safeCount(job.failed);
  const source = job.sourceBucket?.trim() || labels.unknownBucket;
  const destination = job.destinationBucket?.trim();
  const errorMessage =
    job.error?.trim() ||
    (failed > 0 ? `${failed} ${failed === 1 ? labels.objectFailed : labels.objectsFailed}` : undefined);

  return {
    id: `object-job:${job.id}`,
    resourceId: job.id,
    kind: 'object-job',
    direction: 'object-job',
    operation: job.operation,
    name: operationName(job.operation, labels),
    detail: destination ? `${source} → ${destination}` : source,
    status: transferStatus(job),
    transferredBytes: counts.processed,
    totalBytes: counts.total,
    progressFraction: normalizedProgress(job.progress),
    progressDescription: formatObjectJobProgress(job, counts.processed, counts.total, labels),
    errorMessage,
    createdAt: job.createdAt,
    canCancel: objectJobCanCancel(job),
    canRetry: false,
    canShare: false,
    canRemove: false,
  };
}

function transferStatus(job: ObjectJob): TransferStatus {
  switch (job.status) {
    case 'queued':
      return 'waiting';
    case 'scanning':
      return 'preparing';
    case 'running':
      return 'processing';
    case 'cancelling':
      return 'cancelling';
    case 'completed_with_errors':
      return 'completed_with_errors';
    case 'completed':
    case 'failed':
    case 'cancelled':
      return job.status;
    default:
      return 'failed';
  }
}

function operationName(operation: ObjectJobOperation | undefined, labels: ObjectJobTransferLabels): string {
  switch (operation) {
    case 'copy':
      return labels.copyObjects;
    case 'move':
      return labels.moveObjects;
    case 'delete':
      return labels.deleteObjects;
    default:
      return labels.objectOperation;
  }
}

function jobProgressCounts(job: ObjectJob): { processed: number; total: number | null } {
  const processedObjects = safeCount(job.processed);
  const discoveredObjects = safeCount(job.discovered);
  const processedBytes = safeCount(job.bytesProcessed);
  const totalBytes = safeCount(job.bytesTotal);

  if (totalBytes > 0) return { processed: processedBytes, total: totalBytes };
  return { processed: processedObjects, total: discoveredObjects > 0 ? discoveredObjects : null };
}

function formatObjectJobProgress(
  job: ObjectJob,
  processed: number,
  total: number | null,
  labels: ObjectJobTransferLabels,
): string {
  const processedObjects = safeCount(job.processed);
  const discoveredObjects = safeCount(job.discovered);
  const failed = safeCount(job.failed);
  const skipped = safeCount(job.skipped);
  const base = discoveredObjects > 0 ? `${processedObjects} / ${discoveredObjects} ${labels.objectUnits}` : `${processedObjects} ${labels.objectUnits}`;
  const details = [failed > 0 ? `${failed} ${labels.failed}` : '', skipped > 0 ? `${skipped} ${labels.skipped}` : ''].filter(Boolean);

  if (details.length > 0) return `${base} · ${details.join(' · ')}`;
  if (safeCount(job.bytesTotal) > 0 && total !== null) return `${processed} / ${total} bytes`;
  return base;
}

function normalizedProgress(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value / 100, 0), 1);
}

function safeCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
