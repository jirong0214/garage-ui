export type UploadSnapshotState = 'uploading' | 'completed' | 'failed' | 'cancelled';

export type UploadSnapshot = {
  transferId: string;
  state: UploadSnapshotState;
  bytesTransferred: number;
  bytesTotal: number | null;
  localUri: string | null;
  errorCode: string | null;
};

export type EnqueueUploadInput = {
  transferId: string;
  url: string;
  sourceUri: string;
  fileName: string;
  contentType: string;
  objectKey: string;
  authorization: string;
};

export interface UploadEngine {
  enqueue(input: EnqueueUploadInput): Promise<UploadSnapshot>;
  cancel(transferId: string): Promise<void>;
  snapshots(): Promise<UploadSnapshot[]>;
  subscribe(listener: (snapshot: UploadSnapshot) => void): () => void;
  removeSource(transferId: string): Promise<void>;
}
