export const transferDirections = ['download', 'upload'] as const;

export type TransferDirection = (typeof transferDirections)[number];

export const transferStates = [
  'waiting',
  'preparing',
  'downloading',
  'uploading',
  'retrying',
  'completed',
  'failed',
  'cancelled',
] as const;

export type TransferState = (typeof transferStates)[number];

export interface TransferRecord {
  id: string;
  direction: TransferDirection;
  state: TransferState;
  serverId: string;
  bucket: string;
  key: string;
  fileName: string;
  localUri: string | null;
  bytesTransferred: number;
  bytesTotal: number | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateTransferInput {
  id: string;
  direction: TransferDirection;
  serverId: string;
  bucket: string;
  key: string;
  fileName: string;
  localUri?: string | null;
  bytesTotal?: number | null;
}

export interface TransferProgress {
  bytesTransferred: number;
  bytesTotal: number | null;
}

export interface TransferStateUpdate {
  state: TransferState;
  errorCode?: string | null;
  errorMessage?: string | null;
  localUri?: string | null;
}

export function isTransferDirection(value: string): value is TransferDirection {
  return transferDirections.includes(value as TransferDirection);
}

export function isTransferState(value: string): value is TransferState {
  return transferStates.includes(value as TransferState);
}
