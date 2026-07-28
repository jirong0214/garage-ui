import type { UploadEngine } from '../Models/upload-engine';

const unavailable = async (): Promise<never> => {
  throw new Error('Foreground uploads are not available on this platform yet.');
};

export const iosForegroundUploadEngine: UploadEngine = {
  enqueue: unavailable,
  cancel: unavailable,
  snapshots: async () => [],
  subscribe: () => () => undefined,
  removeSource: async () => undefined,
};
