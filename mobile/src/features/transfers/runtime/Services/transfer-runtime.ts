import type { QueryClient } from '@tanstack/react-query';

import type {
  DownloadEngine,
  DownloadEngineSnapshot,
} from '@/features/transfers/download/Models/download-engine';
import type {
  UploadEngine,
  UploadSnapshot,
} from '@/features/objects/upload/Models/upload-engine';
import {
  getTransfer,
  listTransfers,
  updateTransferProgress,
  updateTransferState,
} from '@/features/transfers/queue/Services/transfer-queue-repository';

export async function reconcileDownloadSnapshot(
  snapshot: DownloadEngineSnapshot,
  queryClient: QueryClient,
): Promise<void> {
  const record = await getTransfer(snapshot.transferId);
  if (!record) return;

  const bytesTransferred = safeByteCount(snapshot.bytesTransferred);
  const reportedTotal =
    snapshot.bytesTotal === null ? null : safeByteCount(snapshot.bytesTotal);
  const bytesTotal =
    reportedTotal === null ? record.bytesTotal : Math.max(bytesTransferred, reportedTotal);

  if (!['completed', 'failed', 'cancelled'].includes(record.state)) {
    await updateTransferProgress(snapshot.transferId, { bytesTransferred, bytesTotal });
  }

  const current = await getTransfer(snapshot.transferId);
  if (!current) return;

  if (snapshot.state === 'downloading' && current.state === 'waiting') {
    await updateTransferState(snapshot.transferId, { state: 'preparing' });
    await updateTransferState(snapshot.transferId, { state: 'downloading' });
  } else if (snapshot.state === 'downloading' && current.state === 'preparing') {
    await updateTransferState(snapshot.transferId, { state: 'downloading' });
  } else if (
    snapshot.state !== 'downloading' &&
    !['completed', 'failed', 'cancelled'].includes(current.state)
  ) {
    await updateTransferState(snapshot.transferId, {
      state: snapshot.state,
      localUri: snapshot.state === 'completed' ? snapshot.localUri : undefined,
      errorCode: snapshot.state === 'failed' ? snapshot.errorCode : undefined,
      errorMessage: snapshot.state === 'failed' ? 'The download could not be completed.' : undefined,
    });
  }

  await queryClient.invalidateQueries({ queryKey: ['transfers', record.serverId] });
}

export async function startTransferRuntime(
  downloadEngine: DownloadEngine,
  uploadEngine: UploadEngine,
  queryClient: QueryClient,
  serverId: string,
): Promise<() => void> {
  let active = true;
  const reconcileDownload = (snapshot: DownloadEngineSnapshot) => {
    if (!active) return;
    void reconcileDownloadSnapshot(snapshot, queryClient).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    });
  };
  const reconcileUpload = (snapshot: UploadSnapshot) => {
    if (!active) return;
    void reconcileUploadSnapshot(snapshot, queryClient).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    });
  };
  const unsubscribeDownload = downloadEngine.subscribe(reconcileDownload);
  const unsubscribeUpload = uploadEngine.subscribe(reconcileUpload);
  const [downloadSnapshots, uploadSnapshots] = await Promise.all([
    downloadEngine.snapshots(),
    uploadEngine.snapshots(),
  ]);
  await Promise.all([
    ...downloadSnapshots.map((snapshot) => reconcileDownloadSnapshot(snapshot, queryClient)),
    ...uploadSnapshots.map((snapshot) => reconcileUploadSnapshot(snapshot, queryClient)),
  ]);
  await failInterruptedForegroundUploads(
    serverId,
    new Set(uploadSnapshots.map((snapshot) => snapshot.transferId)),
  );
  await queryClient.invalidateQueries({ queryKey: ['transfers', serverId] });
  return () => {
    active = false;
    unsubscribeDownload();
    unsubscribeUpload();
  };
}

export async function reconcileUploadSnapshot(
  snapshot: UploadSnapshot,
  queryClient: QueryClient,
): Promise<void> {
  const record = await getTransfer(snapshot.transferId);
  if (!record || record.direction !== 'upload') return;

  const bytesTransferred = safeByteCount(snapshot.bytesTransferred);
  const reportedTotal =
    snapshot.bytesTotal === null ? null : safeByteCount(snapshot.bytesTotal);
  const bytesTotal =
    reportedTotal === null ? record.bytesTotal : Math.max(bytesTransferred, reportedTotal);

  if (!['completed', 'failed', 'cancelled'].includes(record.state)) {
    await updateTransferProgress(snapshot.transferId, { bytesTransferred, bytesTotal });
  }

  const current = await getTransfer(snapshot.transferId);
  if (!current) return;
  if (
    snapshot.state === 'completed' &&
    (current.state === 'waiting' || current.state === 'preparing')
  ) {
    if (current.state === 'waiting') {
      await updateTransferState(snapshot.transferId, { state: 'preparing' });
    }
    await updateTransferState(snapshot.transferId, {
      state: 'uploading',
      localUri: snapshot.localUri,
    });
    await updateTransferState(snapshot.transferId, {
      state: 'completed',
      localUri: snapshot.localUri,
    });
  } else if (snapshot.state === 'uploading' && current.state === 'waiting') {
    await updateTransferState(snapshot.transferId, { state: 'preparing' });
    await updateTransferState(snapshot.transferId, {
      state: 'uploading',
      localUri: snapshot.localUri,
    });
  } else if (snapshot.state === 'uploading' && current.state === 'preparing') {
    await updateTransferState(snapshot.transferId, {
      state: 'uploading',
      localUri: snapshot.localUri,
    });
  } else if (
    snapshot.state !== 'uploading' &&
    !['completed', 'failed', 'cancelled'].includes(current.state)
  ) {
    await updateTransferState(snapshot.transferId, {
      state: snapshot.state,
      localUri: snapshot.localUri,
      errorCode: snapshot.state === 'failed' ? snapshot.errorCode : undefined,
      errorMessage: snapshot.state === 'failed' ? 'The upload could not be completed.' : undefined,
    });
  }

  await queryClient.invalidateQueries({ queryKey: ['transfers', record.serverId] });
  if (snapshot.state === 'completed') {
    await queryClient.invalidateQueries({
      queryKey: ['objects', record.serverId, record.bucket],
    });
  }
}

async function failInterruptedForegroundUploads(
  serverId: string,
  activeUploadIds: ReadonlySet<string>,
): Promise<void> {
  const transfers = await listTransfers(serverId);
  await Promise.all(
    transfers
      .filter(
        (record) =>
          record.direction === 'upload' &&
          ['preparing', 'uploading', 'retrying'].includes(record.state) &&
          !activeUploadIds.has(record.id),
      )
      .map((record) =>
        updateTransferState(record.id, {
          state: 'failed',
          errorCode: 'foreground_upload_interrupted',
          errorMessage: 'The foreground upload was interrupted. Retry to continue.',
        }),
      ),
  );
}

function safeByteCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}
