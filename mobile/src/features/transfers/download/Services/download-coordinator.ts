import type { ServerProfile } from '@/features/server/configuration/server-model';
import {
  createTransfer,
  getTransfer,
  updateTransferState,
} from '@/features/transfers/queue/Services/transfer-queue-repository';
import type { TransferRecord } from '@/features/transfers/queue/Models/transfer-record';

import type { DownloadEngine } from '../Models/download-engine';
import { mintDownloadUrl } from './download-api';
import { iosBackgroundDownloadEngine } from './ios-background-download-engine';

export async function enqueueObjectDownload(
  profile: ServerProfile,
  bucket: string,
  key: string,
  bytesTotal?: number | null,
  engine: DownloadEngine = iosBackgroundDownloadEngine,
): Promise<TransferRecord> {
  const transfer = await createTransfer({
    id: createTransferId(),
    direction: 'download',
    serverId: profile.id,
    bucket,
    key,
    fileName: fileNameFromKey(key),
    bytesTotal,
  });
  await prepareAndEnqueue(profile, transfer, engine);
  return (await getTransfer(transfer.id)) ?? transfer;
}

export async function retryObjectDownload(
  profile: ServerProfile,
  transfer: TransferRecord,
  engine: DownloadEngine = iosBackgroundDownloadEngine,
): Promise<void> {
  if (transfer.serverId !== profile.id) {
    throw new Error('This transfer belongs to a different server.');
  }
  await updateTransferState(transfer.id, { state: 'retrying' });
  await prepareAndEnqueue(profile, transfer, engine);
}

async function prepareAndEnqueue(
  profile: ServerProfile,
  transfer: TransferRecord,
  engine: DownloadEngine,
): Promise<void> {
  try {
    await updateTransferState(transfer.id, { state: 'preparing' });
    const temporaryUrl = await mintDownloadUrl(profile, transfer.bucket, transfer.key);
    await engine.enqueue(transfer.id, temporaryUrl, transfer.fileName);
    const enqueued = await getTransfer(transfer.id);
    if (enqueued?.state === 'preparing') {
      try {
        await updateTransferState(transfer.id, { state: 'downloading' });
      } catch (error) {
        const latest = await getTransfer(transfer.id);
        if (!latest || !['downloading', 'completed'].includes(latest.state)) throw error;
      }
    }
  } catch (error) {
    const current = await getTransfer(transfer.id);
    if (
      current &&
      ['waiting', 'preparing', 'retrying'].includes(current.state)
    ) {
      await updateTransferState(transfer.id, {
        state: 'failed',
        errorCode: safeErrorCode(error),
        errorMessage: 'The download could not be started.',
      });
    }
    throw new Error('The download could not be started.');
  }
}

function fileNameFromKey(key: string): string {
  const name = key.split('/').filter(Boolean).at(-1)?.trim();
  return name || 'download';
}

function createTransferId(): string {
  return `download-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 80);
  }
  return 'download_start_failed';
}
