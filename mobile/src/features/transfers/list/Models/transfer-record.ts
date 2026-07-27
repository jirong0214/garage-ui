export type TransferStatus =
  | 'waiting'
  | 'preparing'
  | 'downloading'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TransferRecord = {
  id: string;
  name: string;
  detail?: string | null;
  status: TransferStatus;
  transferredBytes: number;
  totalBytes?: number | null;
  errorMessage?: string | null;
};

export function transferProgress(record: TransferRecord): number | null {
  const total = finiteBytes(record.totalBytes);
  if (total <= 0) return null;
  return Math.min(finiteBytes(record.transferredBytes) / total, 1);
}

export function transferCanCancel(status: TransferStatus): boolean {
  return (
    status === 'waiting' ||
    status === 'preparing' ||
    status === 'downloading' ||
    status === 'retrying'
  );
}

export function transferCanRetry(status: TransferStatus): boolean {
  return status === 'failed' || status === 'cancelled';
}

export function transferCanShare(status: TransferStatus): boolean {
  return status === 'completed';
}

export function transferCanRemove(status: TransferStatus): boolean {
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
  const transferred = formatTransferBytes(record.transferredBytes);
  const total = finiteBytes(record.totalBytes);
  return total > 0 ? `${transferred} / ${formatTransferBytes(total)}` : transferred;
}

function finiteBytes(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
