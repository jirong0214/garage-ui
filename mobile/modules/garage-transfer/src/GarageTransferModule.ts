import { NativeModule, requireNativeModule } from 'expo';

import type {
  DownloadSnapshot,
  GarageTransferEvents,
  UploadSnapshot,
} from './GarageTransfer.types';

declare class GarageTransferModule extends NativeModule<GarageTransferEvents> {
  enqueueDownload(
    transferId: string,
    url: string,
    fileName: string,
  ): Promise<DownloadSnapshot>;
  cancelDownload(transferId: string): Promise<void>;
  getDownloadSnapshots(): Promise<DownloadSnapshot[]>;
  removeDownloadedFile(transferId: string): Promise<void>;
  enqueueUpload(
    transferId: string,
    url: string,
    sourceUri: string,
    fileName: string,
    contentType: string,
    objectKey: string,
    authorization: string,
  ): Promise<UploadSnapshot>;
  cancelUpload(transferId: string): Promise<void>;
  getUploadSnapshots(): Promise<UploadSnapshot[]>;
  removeUploadSource(transferId: string): Promise<void>;
}

export default requireNativeModule<GarageTransferModule>('GarageTransfer');
