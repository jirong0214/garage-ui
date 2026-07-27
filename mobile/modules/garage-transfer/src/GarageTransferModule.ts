import { NativeModule, requireNativeModule } from 'expo';

import type { DownloadSnapshot, GarageTransferEvents } from './GarageTransfer.types';

declare class GarageTransferModule extends NativeModule<GarageTransferEvents> {
  enqueueDownload(
    transferId: string,
    url: string,
    fileName: string,
  ): Promise<DownloadSnapshot>;
  cancelDownload(transferId: string): Promise<void>;
  getDownloadSnapshots(): Promise<DownloadSnapshot[]>;
  removeDownloadedFile(transferId: string): Promise<void>;
}

export default requireNativeModule<GarageTransferModule>('GarageTransfer');
