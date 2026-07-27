import type { DownloadEngine } from '../Models/download-engine';

const unsupportedMessage = 'Reliable background downloads are not available on this platform yet.';

export const iosBackgroundDownloadEngine: DownloadEngine = {
  async enqueue() {
    throw new Error(unsupportedMessage);
  },
  async cancel() {
    throw new Error(unsupportedMessage);
  },
  async snapshots() {
    return [];
  },
  async removeDownloadedFile() {
    throw new Error(unsupportedMessage);
  },
  subscribe() {
    return () => {};
  },
};
