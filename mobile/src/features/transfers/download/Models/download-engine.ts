export type DownloadEngineSnapshot = {
  transferId: string;
  state: 'downloading' | 'completed' | 'failed' | 'cancelled';
  bytesTransferred: number;
  bytesTotal: number | null;
  localUri: string | null;
  errorCode: string | null;
};

export interface DownloadEngine {
  enqueue(
    transferId: string,
    temporaryUrl: string,
    fileName: string,
  ): Promise<DownloadEngineSnapshot>;
  cancel(transferId: string): Promise<void>;
  snapshots(): Promise<DownloadEngineSnapshot[]>;
  removeDownloadedFile(transferId: string): Promise<void>;
  subscribe(listener: (snapshot: DownloadEngineSnapshot) => void): () => void;
}
