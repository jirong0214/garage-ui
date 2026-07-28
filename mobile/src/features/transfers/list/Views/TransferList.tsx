import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';

import { t, type StringKey } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

import {
  formatTransferByteProgress,
  transferCanCancel,
  transferCanRemove,
  transferCanRetry,
  transferCanShare,
  transferProgress,
  type TransferRecord,
  type TransferStatus,
} from '../Models/transfer-record';

export type TransferListProps = {
  records: readonly TransferRecord[];
  loading: boolean;
  error: Error | string | null;
  onRetryLoad(): void;
  onCancel(record: TransferRecord): void;
  onRetry(record: TransferRecord): void;
  onShare(record: TransferRecord): void;
  onRemove(record: TransferRecord): void;
};

export function TransferList({
  records,
  loading,
  error,
  onRetryLoad,
  onCancel,
  onRetry,
  onShare,
  onRemove,
}: TransferListProps) {
  const renderItem = useCallback<ListRenderItem<TransferRecord>>(
    ({ item }) => (
      <TransferCard
        onCancel={onCancel}
        onRemove={onRemove}
        onRetry={onRetry}
        onShare={onShare}
        record={item}
      />
    ),
    [onCancel, onRemove, onRetry, onShare],
  );

  if (loading && records.length === 0) {
    return (
      <View accessibilityLabel={t('loadingTransfers')} style={styles.state}>
        <ActivityIndicator />
        <Text style={styles.stateText}>{t('loadingTransfers')}</Text>
      </View>
    );
  }

  if (error && records.length === 0) {
    return (
      <View accessibilityRole="alert" style={styles.errorState}>
        <Text style={styles.errorText}>{error instanceof Error ? error.message : error}</Text>
        <ActionButton label={t('retry')} onPress={onRetryLoad} />
      </View>
    );
  }

  if (!loading && records.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>{t('noTransfers')}</Text>
        <Text style={styles.emptyText}>{t('noTransfersHint')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={[...records]}
      keyExtractor={(record) => record.id}
      ListHeaderComponent={
        <>
          {loading ? (
            <View accessibilityLabel={t('loadingTransfers')} style={styles.inlineState}>
              <ActivityIndicator size="small" />
              <Text style={styles.inlineStateText}>{t('loadingTransfers')}</Text>
            </View>
          ) : null}
          {error ? (
            <View accessibilityRole="alert" style={styles.inlineError}>
              <Text style={styles.errorText}>
                {error instanceof Error ? error.message : error}
              </Text>
              <ActionButton label={t('retry')} onPress={onRetryLoad} />
            </View>
          ) : null}
        </>
      }
      renderItem={renderItem}
      ItemSeparatorComponent={TransferSeparator}
    />
  );
}

const TransferCard = memo(function TransferCard({
  record,
  onCancel,
  onRetry,
  onShare,
  onRemove,
}: {
  record: TransferRecord;
  onCancel(record: TransferRecord): void;
  onRetry(record: TransferRecord): void;
  onShare(record: TransferRecord): void;
  onRemove(record: TransferRecord): void;
}) {
  const progress = transferProgress(record);
  const percent = progress === null ? undefined : Math.round(progress * 100);
  const status = statusLabel(record.status);
  const progressLabel =
    percent === undefined
      ? `${status}, ${formatTransferByteProgress(record)}`
      : `${status}, ${percent}%, ${formatTransferByteProgress(record)}`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={styles.identity}>
          <Text numberOfLines={2} style={styles.fileName}>
            {record.name.trim() || t('unknownTransfer')}
          </Text>
          {record.detail ? (
            <Text numberOfLines={2} style={styles.detail}>
              {record.detail}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={record.status} />
      </View>

      <View
        accessible
        accessibilityLabel={progressLabel}
        accessibilityRole="progressbar"
        accessibilityValue={
          percent === undefined
            ? { text: formatTransferByteProgress(record) }
            : { min: 0, max: 100, now: percent, text: formatTransferByteProgress(record) }
        }
        style={styles.progressArea}>
        <View style={styles.progressTrack}>
          {progress === null ? (
            <View style={styles.indeterminateProgress} />
          ) : (
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          )}
        </View>
        <View style={styles.progressMetadata}>
          <Text style={styles.bytes}>{formatTransferByteProgress(record)}</Text>
          {percent === undefined ? null : <Text style={styles.percent}>{percent}%</Text>}
        </View>
      </View>

      {record.status === 'failed' && record.errorMessage ? (
        <Text accessibilityRole="alert" style={styles.failure}>
          {record.errorMessage}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {transferCanCancel(record.status) ? (
          <ActionButton
            destructive
            label={t('cancelTransfer')}
            onPress={() => onCancel(record)}
          />
        ) : null}
        {transferCanRetry(record.status) ? (
          <ActionButton label={t('retryTransfer')} onPress={() => onRetry(record)} />
        ) : null}
        {transferCanShare(record) ? (
          <ActionButton label={t('shareTransfer')} onPress={() => onShare(record)} />
        ) : null}
        {transferCanRemove(record.status) ? (
          <ActionButton
            destructive={record.status !== 'completed'}
            label={t('removeTransfer')}
            onPress={() => onRemove(record)}
          />
        ) : null}
      </View>
    </View>
  );
});

function StatusBadge({ status }: { status: TransferStatus }) {
  const active = status === 'downloading' || status === 'uploading' || status === 'retrying';
  const completed = status === 'completed';
  const failed = status === 'failed';

  return (
    <View
      style={[
        styles.badge,
        active && styles.activeBadge,
        completed && styles.completedBadge,
        failed && styles.failedBadge,
      ]}>
      <Text
        style={[
          styles.badgeText,
          active && styles.activeBadgeText,
          completed && styles.completedBadgeText,
          failed && styles.failedBadgeText,
        ]}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  destructive = false,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
      <Text style={[styles.actionLabel, destructive && styles.destructiveLabel]}>{label}</Text>
    </Pressable>
  );
}

function statusLabel(status: TransferStatus): string {
  const key: Record<TransferStatus, StringKey> = {
    waiting: 'transferWaiting',
    preparing: 'transferPreparing',
    downloading: 'transferDownloading',
    uploading: 'transferUploading',
    retrying: 'transferRetrying',
    completed: 'transferCompleted',
    failed: 'transferFailed',
    cancelled: 'transferCancelled',
  };
  return t(key[status]);
}

function TransferSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 24 },
  separator: { height: 12 },
  state: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  stateText: { color: colors.secondaryLabel, fontSize: 15, lineHeight: 21 },
  errorState: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  inlineState: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  inlineStateText: { color: colors.secondaryLabel, fontSize: 14 },
  inlineError: {
    gap: 10,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.danger, fontSize: 15, lineHeight: 21 },
  emptyState: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.label, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyText: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  card: { gap: 13, padding: 14, borderRadius: 14, backgroundColor: colors.surface },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  fileName: { color: colors.label, fontSize: 17, fontWeight: '600', lineHeight: 22 },
  detail: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
  badge: {
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 13,
    backgroundColor: colors.fill,
  },
  badgeText: { color: colors.secondaryLabel, fontSize: 12, fontWeight: '600' },
  activeBadge: { backgroundColor: colors.fill },
  activeBadgeText: { color: colors.accent },
  completedBadge: { backgroundColor: colors.fill },
  completedBadgeText: { color: colors.success },
  failedBadge: { backgroundColor: colors.fill },
  failedBadgeText: { color: colors.danger },
  progressArea: { gap: 7 },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: colors.fill,
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  indeterminateProgress: {
    width: '28%',
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.secondaryLabel,
  },
  progressMetadata: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  bytes: { flexShrink: 1, color: colors.secondaryLabel, fontSize: 13 },
  percent: { color: colors.secondaryLabel, fontSize: 13, fontVariant: ['tabular-nums'] },
  failure: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  actionButton: {
    minHeight: 44,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.fill,
  },
  actionLabel: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  destructiveLabel: { color: colors.danger },
  pressed: { opacity: 0.58 },
});
