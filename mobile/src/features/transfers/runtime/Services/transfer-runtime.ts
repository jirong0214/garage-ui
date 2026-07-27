import type { QueryClient } from '@tanstack/react-query';

import type {
  DownloadEngine,
  DownloadEngineSnapshot,
} from '@/features/transfers/download/Models/download-engine';
import {
  getTransfer,
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
  engine: DownloadEngine,
  queryClient: QueryClient,
): Promise<() => void> {
  let active = true;
  const reconcile = (snapshot: DownloadEngineSnapshot) => {
    if (!active) return;
    void reconcileDownloadSnapshot(snapshot, queryClient).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    });
  };
  const unsubscribe = engine.subscribe(reconcile);
  const snapshots = await engine.snapshots();
  await Promise.all(snapshots.map((snapshot) => reconcileDownloadSnapshot(snapshot, queryClient)));
  return () => {
    active = false;
    unsubscribe();
  };
}

function safeByteCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}
