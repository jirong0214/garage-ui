// Define your exported module types here.
export type DownloadSnapshotState = 'downloading' | 'completed' | 'failed' | 'cancelled';

export type DownloadSnapshot = {
  transferId: string;
  state: DownloadSnapshotState;
  bytesTransferred: number;
  bytesTotal: number | null;
  localUri: string | null;
  errorCode: string | null;
};

export type GarageTransferEvents = {
  onDownloadSnapshot(snapshot: DownloadSnapshot): void;
};
