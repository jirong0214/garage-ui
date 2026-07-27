import type {
  TransferDirection,
  TransferProgress,
  TransferState,
} from '../Models/transfer-record';

const terminalStates = new Set<TransferState>(['completed', 'failed', 'cancelled']);

const allowedTransitions: Record<TransferState, ReadonlySet<TransferState>> = {
  waiting: new Set(['preparing', 'cancelled']),
  preparing: new Set(['downloading', 'uploading', 'retrying', 'failed', 'cancelled']),
  downloading: new Set(['retrying', 'completed', 'failed', 'cancelled']),
  uploading: new Set(['retrying', 'completed', 'failed', 'cancelled']),
  retrying: new Set(['preparing', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(['retrying']),
  cancelled: new Set(['retrying']),
};

export function isTerminalTransferState(state: TransferState): boolean {
  return terminalStates.has(state);
}

export function assertTransferStateTransition(
  direction: TransferDirection,
  current: TransferState,
  next: TransferState,
): void {
  if (!allowedTransitions[current].has(next)) {
    throw new Error(`Invalid transfer state transition: ${current} -> ${next}`);
  }

  if (direction === 'download' && next === 'uploading') {
    throw new Error('A download transfer cannot enter the uploading state');
  }
  if (direction === 'upload' && next === 'downloading') {
    throw new Error('An upload transfer cannot enter the downloading state');
  }
}

export function normalizeTransferProgress(
  bytesTransferred: number,
  bytesTotal: number | null,
): TransferProgress {
  const transferred = normalizeByteCount(bytesTransferred, 'bytesTransferred');
  const total = bytesTotal === null ? null : normalizeByteCount(bytesTotal, 'bytesTotal');

  if (total !== null && transferred > total) {
    throw new Error('bytesTransferred cannot exceed bytesTotal');
  }

  return { bytesTransferred: transferred, bytesTotal: total };
}

function normalizeByteCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}
