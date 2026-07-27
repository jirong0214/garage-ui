import { NativeModule } from 'expo';

import type { DownloadSnapshot, GarageTransferEvents } from './GarageTransfer.types';

class GarageTransferModule extends NativeModule<GarageTransferEvents> {
  async enqueueDownload(): Promise<DownloadSnapshot> {
    throw new Error('Background downloads are not available on web.');
  }

  async cancelDownload(): Promise<void> {
    throw new Error('Background downloads are not available on web.');
  }

  async getDownloadSnapshots(): Promise<DownloadSnapshot[]> {
    return [];
  }

  async removeDownloadedFile(): Promise<void> {
    throw new Error('Background downloads are not available on web.');
  }
}

export default new GarageTransferModule();
