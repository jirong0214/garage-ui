import { useInfiniteQuery } from '@tanstack/react-query';
import type { ModelsBucketInfo } from '@garage-ui/api-client';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ServerProfile } from '@/features/server/configuration/server-model';
import { fetchObjects } from '@/infrastructure/api/garage-api';
import { t } from '@/shared/i18n/strings';
import { InlineError } from '@/shared/ui/components';
import { colors } from '@/shared/ui/theme';

import {
  destinationContainsSelection,
  type ObjectJobOperation,
} from '../Models/object-operation';

const pageSize = 100;

export function ObjectDestinationPicker({
  visible,
  operation,
  profile,
  buckets,
  sourceBucket,
  selectedObjects,
  selectedPrefixes,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  operation: ObjectJobOperation;
  profile: ServerProfile;
  buckets: readonly ModelsBucketInfo[];
  sourceBucket: string;
  selectedObjects: readonly string[];
  selectedPrefixes: readonly string[];
  submitting: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(destinationBucket: string, destinationPrefix: string, overwrite: boolean): void;
}) {
  const initialBucket = buckets.find((bucket) => bucket.name === sourceBucket)?.name ?? buckets[0]?.name ?? '';
  const [bucket, setBucket] = useState(initialBucket);
  const [prefix, setPrefix] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ['destination-folders', profile.id, bucket, prefix],
    queryFn: ({ pageParam }) =>
      fetchObjects(profile, bucket, {
        prefix,
        maxKeys: pageSize,
        continuationToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (page) =>
      page.is_truncated && page.next_continuation_token
        ? page.next_continuation_token
        : undefined,
    enabled: visible && Boolean(bucket),
  });
  const folders = useMemo(
    () => [...new Set((query.data?.pages ?? []).flatMap((page) => page.prefixes ?? []))],
    [query.data?.pages],
  );
  const invalidDestination = destinationContainsSelection(
    sourceBucket,
    bucket,
    prefix,
    selectedObjects,
    selectedPrefixes,
  );

  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.navigation}>
          <NavigationButton disabled={submitting} label={t('cancel')} onPress={onCancel} />
          <Text accessibilityRole="header" style={styles.title}>
            {operation === 'copy' ? t('copyTo') : t('moveTo')}
          </Text>
          <NavigationButton
            disabled={submitting || !bucket || invalidDestination}
            emphasized
            label={submitting ? t('startingJob') : t('choose')}
            onPress={() => onSubmit(bucket, prefix, overwrite)}
          />
        </View>

        <View style={styles.bucketStrip}>
          <FlatList
            horizontal
            contentContainerStyle={styles.bucketList}
            data={[...buckets]}
            keyExtractor={(item) => item.name ?? ''}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.name === bucket }}
                onPress={() => {
                  setBucket(item.name ?? '');
                  setPrefix('');
                }}
                style={[styles.bucket, item.name === bucket && styles.bucketSelected]}>
                <Text numberOfLines={1} style={[styles.bucketLabel, item.name === bucket && styles.bucketLabelSelected]}>{item.name}</Text>
              </Pressable>
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        <View style={styles.pathRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!prefix}
            onPress={() => setPrefix(parentPrefix(prefix))}
            style={styles.upButton}>
            <Text style={[styles.upLabel, !prefix && styles.disabled]}>{t('upOneLevel')}</Text>
          </Pressable>
          <Text numberOfLines={2} style={styles.path}>{bucket} / {prefix || t('bucketRoot')}</Text>
        </View>

        {invalidDestination ? <Text accessibilityRole="alert" style={styles.warning}>{t('invalidDestination')}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {query.isError && !query.data ? (
          <View style={styles.state}><InlineError message={query.error.message} onRetry={() => void query.refetch()} /></View>
        ) : (
          <FlatList
            contentContainerStyle={folders.length ? styles.folderList : styles.empty}
            data={folders}
            keyExtractor={(item) => item}
            ListEmptyComponent={
              query.isPending
                ? <ActivityIndicator />
                : <Text style={styles.emptyText}>{t('noSubfolders')}</Text>
            }
            ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityHint={t('openFolder')}
                accessibilityRole="button"
                onPress={() => setPrefix(item)}
                style={({ pressed }) => [styles.folder, pressed && styles.pressed]}>
                <Text accessibilityElementsHidden style={styles.folderIcon}>▰</Text>
                <Text numberOfLines={2} style={styles.folderName}>{folderName(item, prefix)}</Text>
                <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
              </Pressable>
            )}
          />
        )}

        <View style={styles.conflict}>
          <Text style={styles.conflictTitle}>{t('conflictPolicy')}</Text>
          <View style={styles.conflictActions}>
            <PolicyButton active={!overwrite} label={t('skipExisting')} onPress={() => setOverwrite(false)} />
            <PolicyButton active={overwrite} label={t('replaceExisting')} onPress={() => setOverwrite(true)} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function NavigationButton({ label, disabled, emphasized, onPress }: { label: string; disabled?: boolean; emphasized?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.navigationButton}>
      <Text style={[styles.navigationLabel, emphasized && styles.emphasized, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

function PolicyButton({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.policy, active && styles.policyActive]}>
      <Text style={[styles.policyLabel, active && styles.policyLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function parentPrefix(prefix: string): string {
  const parts = prefix.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `${parts.join('/')}/` : '';
}

function folderName(folder: string, prefix: string): string {
  return folder.slice(prefix.length).replace(/\/$/, '');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  navigation: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator, paddingHorizontal: 8 },
  title: { flex: 1, color: colors.label, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  navigationButton: { minWidth: 72, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  navigationLabel: { color: colors.accent, fontSize: 16 },
  emphasized: { fontWeight: '600', textAlign: 'right' },
  disabled: { opacity: 0.4 },
  bucketStrip: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  bucketList: { gap: 8, alignItems: 'center', paddingHorizontal: 12 },
  bucket: { maxWidth: 150, minHeight: 36, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.fill, paddingHorizontal: 12 },
  bucketSelected: { backgroundColor: colors.accent },
  bucketLabel: { color: colors.label, fontSize: 14, fontWeight: '600' },
  bucketLabelSelected: { color: 'white' },
  pathRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  upButton: { minWidth: 76, minHeight: 44, justifyContent: 'center' },
  upLabel: { color: colors.accent, fontSize: 15 },
  path: { flex: 1, color: colors.secondaryLabel, fontSize: 13 },
  warning: { color: colors.danger, paddingHorizontal: 12, paddingBottom: 8, fontSize: 13 },
  error: { color: colors.danger, paddingHorizontal: 12, paddingBottom: 8, fontSize: 13 },
  state: { flex: 1, justifyContent: 'center', padding: 20 },
  folderList: { paddingHorizontal: 12, paddingBottom: 12 },
  empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.secondaryLabel, fontSize: 15 },
  folder: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  folderIcon: { color: colors.accent, fontSize: 18 },
  folderName: { flex: 1, color: colors.label, fontSize: 16 },
  chevron: { color: colors.secondaryLabel, fontSize: 25 },
  footer: { padding: 12 },
  pressed: { opacity: 0.55 },
  conflict: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, padding: 12 },
  conflictTitle: { color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' },
  conflictActions: { flexDirection: 'row', gap: 8 },
  policy: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.fill, paddingHorizontal: 8 },
  policyActive: { backgroundColor: colors.accent },
  policyLabel: { color: colors.label, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  policyLabelActive: { color: 'white' },
});
