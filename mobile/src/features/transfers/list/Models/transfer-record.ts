export type TransferStatus =
  | 'waiting'
  | 'preparing'
  | 'downloading'
  | 'uploading'
  | 'retrying'
  | 'processing'
  | 'cancelling'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export type TransferRecord = {
  id: string;
  resourceId?: string;
  kind?: 'file-transfer' | 'object-job';
  direction: 'download' | 'upload' | 'object-job';
  operation?: 'copy' | 'move' | 'delete';
  name: string;
  detail?: string | null;
  status: TransferStatus;
  transferredBytes: number;
  totalBytes?: number | null;
  progressFraction?: number | null;
  progressDescription?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  canCancel?: boolean;
  canRetry?: boolean;
  canShare?: boolean;
  canRemove?: boolean;
};

export function transferProgress(record: TransferRecord): number | null {
  if (typeof record.progressFraction === 'number' && Number.isFinite(record.progressFraction)) {
    return Math.min(Math.max(record.progressFraction, 0), 1);
  }
  const total = finiteBytes(record.totalBytes);
  if (total <= 0) return null;
  return Math.min(finiteBytes(record.transferredBytes) / total, 1);
}

export function transferCanCancel(record: TransferRecord | TransferStatus): boolean {
  if (typeof record === 'string') return defaultCanCancel(record);
  if (typeof record.canCancel === 'boolean') return record.canCancel;
  return defaultCanCancel(record.status);
}

function defaultCanCancel(status: TransferStatus): boolean {
  return (
    status === 'waiting' ||
    status === 'preparing' ||
    status === 'downloading' ||
    status === 'uploading' ||
    status === 'retrying'
  );
}

export function transferCanRetry(record: TransferRecord | TransferStatus): boolean {
  if (typeof record === 'string') return record === 'failed' || record === 'cancelled';
  if (typeof record.canRetry === 'boolean') return record.canRetry;
  const status = record.status;
  return status === 'failed' || status === 'cancelled';
}

export function transferCanShare(record: TransferRecord): boolean {
  if (typeof record.canShare === 'boolean') return record.canShare;
  return record.direction === 'download' && record.status === 'completed';
}

export function transferCanRemove(record: TransferRecord | TransferStatus): boolean {
  if (typeof record === 'string') {
    return record === 'completed' || record === 'failed' || record === 'cancelled';
  }
  if (typeof record.canRemove === 'boolean') return record.canRemove;
  const status = record.status;
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function formatTransferBytes(bytes: number): string {
  const value = finiteBytes(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let unitIndex = 0;
  let displayed = value;

  while (displayed >= 1024 && unitIndex < units.length - 1) {
    displayed /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${Math.round(displayed)} ${units[unitIndex]}`;
  return `${displayed.toFixed(1)} ${units[unitIndex]}`;
}

export function formatTransferByteProgress(record: TransferRecord): string {
  if (record.progressDescription) return record.progressDescription;
  const transferred = formatTransferBytes(record.transferredBytes);
  const total = finiteBytes(record.totalBytes);
  return total > 0 ? `${transferred} / ${formatTransferBytes(total)}` : transferred;
}

function finiteBytes(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
