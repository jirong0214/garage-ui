import GarageTransfer from '@garage-transfer';

import type {
  DownloadEngine,
  DownloadEngineSnapshot,
} from '../Models/download-engine';

export const iosBackgroundDownloadEngine: DownloadEngine = {
  enqueue(transferId, temporaryUrl, fileName) {
    return GarageTransfer.enqueueDownload(transferId, temporaryUrl, fileName);
  },
  cancel(transferId) {
    return GarageTransfer.cancelDownload(transferId);
  },
  snapshots() {
    return GarageTransfer.getDownloadSnapshots();
  },
  removeDownloadedFile(transferId) {
    return GarageTransfer.removeDownloadedFile(transferId);
  },
  subscribe(listener) {
    const subscription = GarageTransfer.addListener(
      'onDownloadSnapshot',
      (snapshot: DownloadEngineSnapshot) => listener(snapshot),
    );
    return () => subscription.remove();
  },
};
