import GarageTransfer from '@garage-transfer';

import type { UploadEngine } from '../Models/upload-engine';

export const iosForegroundUploadEngine: UploadEngine = {
  enqueue(input) {
    return GarageTransfer.enqueueUpload(
      input.transferId,
      input.url,
      input.sourceUri,
      input.fileName,
      input.contentType,
      input.objectKey,
      input.authorization,
    );
  },
  cancel(transferId) {
    return GarageTransfer.cancelUpload(transferId);
  },
  snapshots() {
    return GarageTransfer.getUploadSnapshots();
  },
  subscribe(listener) {
    const subscription = GarageTransfer.addListener('onUploadSnapshot', listener);
    return () => subscription.remove();
  },
  removeSource(transferId) {
    return GarageTransfer.removeUploadSource(transferId);
  },
};
