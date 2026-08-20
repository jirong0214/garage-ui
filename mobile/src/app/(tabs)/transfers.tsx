import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session/session-store';
import { fetchCapabilities } from '@/infrastructure/api/garage-api';
import {
  isObjectJobActive,
  type ObjectJob,
} from '@/features/objects/jobs/Models/object-job';
import { objectJobToTransferRecord } from '@/features/objects/jobs/Models/object-job-transfer';
import {
  cancelObjectJob,
  listObjectJobs,
} from '@/features/objects/jobs/Services/object-jobs-api';
import { iosBackgroundDownloadEngine } from '@/features/transfers/download/Services/ios-background-download-engine';
import { retryObjectDownload } from '@/features/transfers/download/Services/download-coordinator';
import { iosForegroundUploadEngine } from '@/features/objects/upload/Services/ios-foreground-upload-engine';
import { retryObjectUpload } from '@/features/objects/upload/Services/upload-coordinator';
import type { TransferRecord as TransferListRecord } from '@/features/transfers/list/Models/transfer-record';
import { TransferList } from '@/features/transfers/list/Views/TransferList';
import type { TransferRecord } from '@/features/transfers/queue/Models/transfer-record';
import {
  getTransfer,
  listTransfers,
  removeTransfer,
  updateTransferState,
} from '@/features/transfers/queue/Services/transfer-queue-repository';
import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

export default function TransfersScreen() {
  const profile = useSessionStore((state) => state.server);
  const queryClient = useQueryClient();
  const capabilities = useQuery({
    queryKey: ['capabilities', profile?.id],
    queryFn: () => fetchCapabilities(profile!),
    enabled: Boolean(profile),
  });
  const jobsEnabled = capabilities.data?.features?.objectJobs === true;
  const localQuery = useQuery({
    queryKey: ['transfers', profile?.id],
    queryFn: () => listTransfers(profile!.id),
    enabled: Boolean(profile),
  });
  const jobsQuery = useQuery({
    queryKey: ['object-jobs', profile?.id],
    queryFn: () => listObjectJobs(profile!, 50),
    enabled: Boolean(profile) && jobsEnabled,
    refetchInterval: (query) =>
      (query.state.data as ObjectJob[] | undefined)?.some(isObjectJobActive) ? 2_000 : false,
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<void>) => operation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transfers', profile?.id] }),
        queryClient.invalidateQueries({ queryKey: ['object-jobs', profile?.id] }),
      ]);
    },
    onError: (error) => {
      Alert.alert(t('transferActionFailed'), error instanceof Error ? error.message : undefined);
    },
  });

  const recordById = useCallback(
    (record: TransferListRecord) => localQuery.data?.find((item) => item.id === record.resourceId),
    [localQuery.data],
  );
  const onCancel = useCallback(
    (record: TransferListRecord) => {
      mutation.mutate(async () => {
        if (record.kind === 'object-job') {
          if (!profile || !record.resourceId) return;
          await cancelObjectJob(profile, record.resourceId);
          return;
        }
        const queueRecord = recordById(record);
        if (!queueRecord) return;
        if (queueRecord.direction === 'upload') {
          await iosForegroundUploadEngine.cancel(record.id);
        } else {
          await iosBackgroundDownloadEngine.cancel(record.id);
        }
        const current = await getTransfer(record.id);
        if (current && !['completed', 'failed', 'cancelled'].includes(current.state)) {
          await updateTransferState(record.id, { state: 'cancelled' });
        }
      });
    },
    [mutation, profile, recordById],
  );
  const onRetry = useCallback(
    (record: TransferListRecord) => {
      const queueRecord = recordById(record);
      if (!profile || !queueRecord) return;
      mutation.mutate(() =>
        queueRecord.direction === 'upload'
          ? retryObjectUpload(profile, queueRecord)
          : retryObjectDownload(profile, queueRecord),
      );
    },
    [mutation, profile, recordById],
  );
  const onShare = useCallback(
    (record: TransferListRecord) => {
      const queueRecord = recordById(record);
      if (!queueRecord?.localUri) return;
      const localUri = queueRecord.localUri;
      mutation.mutate(async () => {
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error(t('sharingUnavailable'));
        }
        await Sharing.shareAsync(localUri);
      });
    },
    [mutation, recordById],
  );
  const onRemove = useCallback(
    (record: TransferListRecord) => {
      mutation.mutate(async () => {
        const queueRecord = recordById(record);
        if (queueRecord?.direction === 'upload') {
          await iosForegroundUploadEngine.removeSource(record.id);
        } else {
          await iosBackgroundDownloadEngine.removeDownloadedFile(record.id);
        }
        await removeTransfer(record.id);
      });
    },
    [mutation, recordById],
  );

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('transfers')}
      </Text>
      <TransferList
        error={localQuery.error ?? capabilities.error ?? (jobsEnabled ? jobsQuery.error : null)}
        loading={localQuery.isPending || capabilities.isPending || (jobsEnabled && jobsQuery.isPending)}
        onCancel={onCancel}
        onRemove={onRemove}
        onRetry={onRetry}
        onRetryLoad={() => void Promise.all([
          localQuery.refetch(),
          capabilities.refetch(),
          ...(jobsEnabled ? [jobsQuery.refetch()] : []),
        ])}
        onShare={onShare}
        records={mergeTransferRecords(localQuery.data ?? [], jobsQuery.data ?? [])}
      />
    </View>
  );
}

function toListRecord(record: TransferRecord): TransferListRecord {
  return {
    id: record.id,
    resourceId: record.id,
    kind: 'file-transfer',
    direction: record.direction,
    name: record.fileName,
    detail: `${record.bucket} / ${record.key}`,
    status: record.state,
    transferredBytes: record.bytesTransferred,
    totalBytes: record.bytesTotal,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
  };
}

function mergeTransferRecords(
  localRecords: readonly TransferRecord[],
  objectJobs: readonly ObjectJob[],
): TransferListRecord[] {
  return [
    ...localRecords.map(toListRecord),
    ...objectJobs.flatMap((job) => {
      const record = objectJobToTransferRecord(job, {
        unknownBucket: t('unknownBucket'),
        copyObjects: t('copyObjects'),
        moveObjects: t('moveObjects'),
        deleteObjects: t('deleteObjects'),
        objectOperation: t('objectOperation'),
        objectFailed: t('objectFailed'),
        objectsFailed: t('objectsFailed'),
        objectUnits: t('objectUnits'),
        failed: t('failed'),
        skipped: t('skipped'),
      });
      return record ? [record] : [];
    }),
  ].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 18,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.label,
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
