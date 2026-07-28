import { authorizationHeaders } from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import type { TransferRecord } from '@/features/transfers/queue/Models/transfer-record';
import {
  createTransfer,
  getTransfer,
  updateTransferState,
} from '@/features/transfers/queue/Services/transfer-queue-repository';

import type { PendingUpload } from '../Models/upload-candidate';
import type { UploadEngine } from '../Models/upload-engine';
import { uploadObjectKey } from '../Utils/upload-object-key';
import { iosForegroundUploadEngine } from './ios-foreground-upload-engine';

export type UploadBatchResult = {
  queued: number;
  failed: number;
};

export async function enqueueObjectUploads(
  profile: ServerProfile,
  bucket: string,
  prefix: string,
  uploads: readonly PendingUpload[],
  engine: UploadEngine = iosForegroundUploadEngine,
): Promise<UploadBatchResult> {
  let queued = 0;
  let failed = 0;

  for (const upload of uploads) {
    const key = uploadObjectKey(prefix, upload.objectName);
    const transfer = await createTransfer({
      id: createUploadTransferId(),
      direction: 'upload',
      serverId: profile.id,
      bucket,
      key,
      fileName: upload.objectName,
      contentType: upload.contentType,
      localUri: upload.sourceUri,
      bytesTotal: upload.size,
    });
    try {
      await prepareAndEnqueueUpload(profile, transfer, engine);
      queued += 1;
    } catch {
      failed += 1;
    }
  }

  return { queued, failed };
}

export async function retryObjectUpload(
  profile: ServerProfile,
  transfer: TransferRecord,
  engine: UploadEngine = iosForegroundUploadEngine,
): Promise<void> {
  if (transfer.serverId !== profile.id) {
    throw new Error('This transfer belongs to a different server.');
  }
  if (!transfer.localUri) {
    throw new Error('The local upload source is no longer available.');
  }
  await updateTransferState(transfer.id, { state: 'retrying' });
  await prepareAndEnqueueUpload(profile, transfer, engine);
}

async function prepareAndEnqueueUpload(
  profile: ServerProfile,
  transfer: TransferRecord,
  engine: UploadEngine,
): Promise<void> {
  try {
    await updateTransferState(transfer.id, { state: 'preparing' });
    const headers = await authorizationHeaders(profile);
    const snapshot = await engine.enqueue({
      transferId: transfer.id,
      url: uploadEndpoint(profile, transfer.bucket),
      sourceUri: transfer.localUri!,
      fileName: transfer.fileName,
      contentType: transfer.contentType || 'application/octet-stream',
      objectKey: transfer.key,
      authorization: headers.Authorization,
    });
    const current = await getTransfer(transfer.id);
    if (current?.state === 'preparing') {
      await updateTransferState(transfer.id, {
        state: 'uploading',
        localUri: snapshot.localUri,
      });
    }
  } catch (error) {
    const current = await getTransfer(transfer.id);
    if (current && ['waiting', 'preparing', 'retrying'].includes(current.state)) {
      await updateTransferState(transfer.id, {
        state: 'failed',
        errorCode: safeErrorCode(error),
        errorMessage: 'The upload could not be started.',
      });
    }
    throw new Error('The upload could not be started.');
  }
}

function uploadEndpoint(profile: ServerProfile, bucket: string): string {
  return `${profile.baseUrl}/api/v1/buckets/${encodeURIComponent(bucket)}/objects`;
}

function createUploadTransferId(): string {
  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 80);
  }
  return 'upload_start_failed';
}
