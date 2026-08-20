import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSessionStore } from '@/features/auth/session/session-store';
import {
  bucketAuthorization,
  canReceiveObjects,
} from '@/features/auth/authorization/Models/bucket-permissions';
import { createObjectJob } from '@/features/objects/jobs/Services/object-jobs-api';
import {
  selectionFromEntries,
  type ObjectJobOperation,
} from '@/features/objects/operations/Models/object-operation';
import { renameObject } from '@/features/objects/operations/Services/object-operations-api';
import { ObjectDestinationPicker } from '@/features/objects/operations/Views/ObjectDestinationPicker';
import { ObjectSelectionToolbar } from '@/features/objects/operations/Views/ObjectSelectionToolbar';
import { RenameObjectDialog } from '@/features/objects/operations/Views/RenameObjectDialog';
import { UploadComposer } from '@/features/objects/upload/Views/UploadComposer';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { ObjectThumbnail } from '@/features/storage/object-preview/thumbnail';
import { fetchBuckets, fetchCapabilities } from '@/infrastructure/api/garage-api';
import { t } from '@/shared/i18n/strings';
import { InlineError } from '@/shared/ui/components';
import { colors } from '@/shared/ui/theme';

import type { BrowserEntry } from '../Models/browser-entry';
import {
  browserSortModes,
  defaultBrowserPreferences,
  type BrowserPreferences,
  type BrowserSortMode,
} from '../Models/browser-preferences';
import {
  loadBrowserPreferences,
  saveBrowserPreferences,
} from '../Services/browser-preferences-repository';
import { useObjectPages } from '../Services/use-object-pages';
import { createBrowserEntries, formatBytes, sortBrowserEntries } from '../Utils/browser-entries';
import { useDebouncedValue } from '../Utils/use-debounced-value';

const estimatedRowHeight = 63;
const restoreBufferRows = 8;

export default function ObjectBrowserScreen() {
  const parameters = useLocalSearchParams<{ bucket: string; prefix?: string }>();
  const bucket = parameters.bucket;
  const prefix = parameters.prefix ?? '';
  const server = useSessionStore((state) => state.server);
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [selectionState, setSelectionState] = useState<{
    locationKey: string;
    ids: ReadonlySet<string>;
  } | null>(null);
  const [destinationOperation, setDestinationOperation] = useState<ObjectJobOperation | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const search = useDebouncedValue(searchInput.trim(), 300);
  const locationKey = `${server?.id ?? ''}\u0000${bucket}\u0000${prefix}`;
  const [storedPreferences, setStoredPreferences] = useState<{
    locationKey: string;
    value: BrowserPreferences;
  } | null>(null);
  const [restoredLocationKey, setRestoredLocationKey] = useState<string | null>(null);
  const preferencesReady = storedPreferences?.locationKey === locationKey;
  const preferences = preferencesReady ? storedPreferences.value : defaultBrowserPreferences;
  const didRestoreScroll = restoredLocationKey === locationKey;
  const listRef = useRef<FlatList<BrowserEntry>>(null);
  const longPressedIdRef = useRef<string | null>(null);
  const query = useObjectPages(server, bucket, prefix, search);
  const selectedIds = useMemo(
    () => selectionState?.locationKey === locationKey ? selectionState.ids : new Set<string>(),
    [locationKey, selectionState],
  );
  const selectionMode = selectionState?.locationKey === locationKey;
  const capabilities = useQuery({
    queryKey: ['capabilities', server?.id],
    queryFn: () => fetchCapabilities(server!),
    enabled: Boolean(server),
  });
  const buckets = useQuery({
    queryKey: ['buckets', server?.id],
    queryFn: () => fetchBuckets(server!),
    enabled: Boolean(server) && capabilities.isSuccess,
  });

  useEffect(() => {
    let active = true;
    if (!server || !bucket) return;

    void loadBrowserPreferences(server.id, bucket, prefix).then((stored) => {
      if (!active) return;
      setStoredPreferences({ locationKey, value: stored });
    });
    return () => {
      active = false;
    };
  }, [bucket, locationKey, prefix, server]);

  const entries = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const prefixes = pages.flatMap((page) => page.prefixes ?? []);
    const objects = pages.flatMap((page) => page.objects ?? []);
    return sortBrowserEntries(createBrowserEntries(prefix, prefixes, objects), preferences.sortMode);
  }, [preferences.sortMode, prefix, query.data?.pages]);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedIds.has(entry.id)),
    [entries, selectedIds],
  );
  const selection = useMemo(() => selectionFromEntries(selectedEntries), [selectedEntries]);
  const currentBucket = buckets.data?.find((item) => item.name === bucket);
  const authorization = bucketAuthorization(currentBucket, capabilities.data?.access_control);
  const destinationBuckets = (buckets.data ?? []).filter((item) =>
    canReceiveObjects(item, capabilities.data?.access_control),
  );
  const objectJobsAvailable = capabilities.data?.features?.objectJobs === true;
  const canCopy = objectJobsAvailable && authorization.canList && authorization.canRead && destinationBuckets.length > 0;
  const canMove = canCopy && authorization.canDelete;
  const canDelete = objectJobsAvailable && authorization.canList && authorization.canDelete;
  const canRename = authorization.canRead && authorization.canWrite && authorization.canDelete;
  const selectionAvailable = canCopy || canMove || canDelete || canRename;
  const operation = useMutation({
    mutationFn: async (run: () => Promise<void>) => run(),
    onError: (error) => setOperationError(error instanceof Error ? error.message : t('operationFailed')),
  });

  const rowsNeededForRestore =
    search || !preferencesReady || preferences.scrollOffset === 0
      ? 0
      : Math.ceil(preferences.scrollOffset / estimatedRowHeight) + restoreBufferRows;

  useEffect(() => {
    if (
      rowsNeededForRestore > entries.length &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      void query.fetchNextPage();
    }
  }, [entries.length, query, rowsNeededForRestore]);

  useEffect(() => {
    if (
      didRestoreScroll ||
      !preferencesReady ||
      search ||
      query.isPending ||
      (rowsNeededForRestore > entries.length && query.hasNextPage)
    ) {
      return;
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: preferences.scrollOffset, animated: false });
      setRestoredLocationKey(locationKey);
    });
  }, [
    didRestoreScroll,
    entries.length,
    locationKey,
    preferences.scrollOffset,
    preferencesReady,
    query.hasNextPage,
    query.isPending,
    rowsNeededForRestore,
    search,
  ]);

  function selectSortMode(sortMode: BrowserSortMode) {
    const next = { sortMode, scrollOffset: 0 };
    setStoredPreferences({ locationKey, value: next });
    setRestoredLocationKey(locationKey);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    if (server) void saveBrowserPreferences(server.id, bucket, prefix, next);
  }

  function updateSearchInput(value: string) {
    setSearchInput(value);
    setRestoredLocationKey(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  function persistScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!server || search || !preferencesReady) return;
    const next = { ...preferences, scrollOffset: event.nativeEvent.contentOffset.y };
    setStoredPreferences({ locationKey, value: next });
    void saveBrowserPreferences(server.id, bucket, prefix, next);
  }

  function toggleSelection(item: BrowserEntry) {
    setSelectionState((current) => {
      const next = new Set(current?.locationKey === locationKey ? current.ids : []);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return { locationKey, ids: next };
    });
  }

  function beginSelection(item: BrowserEntry) {
    longPressedIdRef.current = item.id;
    toggleSelection(item);
    setTimeout(() => {
      if (longPressedIdRef.current === item.id) longPressedIdRef.current = null;
    }, 800);
  }

  function clearSelection() {
    setSelectionState(null);
    setDestinationOperation(null);
    setRenameVisible(false);
    setOperationError(null);
  }

  function startDelete() {
    const message =
      selectedEntries.length === 1
        ? selectedEntries[0].folder
          ? t('deleteFolderMessage')
          : t('deleteObjectMessage')
        : t('deleteSelectionMessage');
    Alert.alert(t('deleteSelectionTitle'), `${selectedEntries.length} ${t('selected')}. ${message}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => submitJob('delete'),
      },
    ]);
  }

  function submitJob(
    jobOperation: 'delete' | ObjectJobOperation,
    destinationBucket?: string,
    destinationPrefix?: string,
    overwrite = false,
  ) {
    if (!server || selectedEntries.length === 0) return;
    setOperationError(null);
    operation.mutate(async () => {
      await createObjectJob(server, {
        operation: jobOperation,
        sourceBucket: bucket,
        objects: selection.objects,
        prefixes: selection.prefixes,
        destinationBucket: jobOperation === 'delete' ? undefined : destinationBucket,
        destinationPrefix: jobOperation === 'delete' ? undefined : destinationPrefix,
        conflictPolicy: jobOperation === 'delete' ? undefined : overwrite ? 'overwrite' : 'skip',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-jobs', server.id] }),
        queryClient.invalidateQueries({ queryKey: ['objects', server.id, bucket] }),
      ]);
      clearSelection();
      Alert.alert(t('jobStarted'));
      router.push('/(tabs)/transfers');
    });
  }

  function submitRename(destinationKey: string) {
    const selected = selectedEntries[0];
    if (!server || !selected) return;
    setOperationError(null);
    operation.mutate(async () => {
      if (selected.folder) {
        await createObjectJob(server, {
          operation: 'move',
          sourceBucket: bucket,
          prefixes: [selected.key],
          destinationBucket: bucket,
          destinationPrefix: destinationKey,
          replaceSourcePrefix: true,
          conflictPolicy: 'skip',
        });
        await queryClient.invalidateQueries({ queryKey: ['object-jobs', server.id] });
      } else {
        await renameObject(server, bucket, selected.key, destinationKey);
        await queryClient.invalidateQueries({ queryKey: ['objects', server.id, bucket] });
      }
      clearSelection();
      if (selected.folder) {
        Alert.alert(t('jobStarted'));
        router.push('/(tabs)/transfers');
      } else {
        Alert.alert(t('objectRenamed'));
      }
    });
  }

  if (query.isError && !query.data) {
    return (
      <View style={styles.center}>
        <InlineError message={query.error.message} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  if (!server) return null;

  const searchIsPartial =
    Boolean(search) &&
    Boolean(query.data?.pages.some((page) => page.is_truncated && !page.next_continuation_token));

  return (
    <>
      <Stack.Screen
        options={{
          title: prefix ? prefix.split('/').filter(Boolean).at(-1) : bucket,
        }}
      />
      <View style={styles.screen}>
        {selectionMode ? (
          <ObjectSelectionToolbar
            busy={operation.isPending}
            canCopy={selectedEntries.length > 0 && canCopy}
            canDelete={selectedEntries.length > 0 && canDelete}
            canMove={selectedEntries.length > 0 && canMove}
            canRename={
              selectedEntries.length === 1 &&
              (selectedEntries[0].folder ? canMove : canRename)
            }
            count={selectedEntries.length}
            onCancel={clearSelection}
            onCopy={() => setDestinationOperation('copy')}
            onDelete={startDelete}
            onMove={() => setDestinationOperation('move')}
            onRename={() => setRenameVisible(true)}
          />
        ) : null}
        <View style={styles.controls}>
          {authorization.canWrite || selectionAvailable ? (
            <View style={styles.actionRow}>
              {authorization.canWrite && !selectionMode ? (
                <UploadComposer bucket={bucket} prefix={prefix} profile={server} />
              ) : null}
              {selectionAvailable && !selectionMode ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectionState({ locationKey, ids: new Set() })}
                  style={({ pressed }) => [styles.selectButton, pressed && styles.pressed]}>
                  <Text style={styles.selectButtonLabel}>{t('select')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <TextInput
            accessibilityLabel={t('searchObjects')}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={updateSearchInput}
            placeholder={t('searchObjects')}
            placeholderTextColor={colors.secondaryLabel}
            returnKeyType="search"
            style={styles.search}
            value={searchInput}
          />
          <View accessibilityRole="tablist" style={styles.sortGroup}>
            {browserSortModes.map((mode) => (
              <SortButton
                key={mode}
                active={preferences.sortMode === mode}
                label={sortLabel(mode)}
                onPress={() => selectSortMode(mode)}
              />
            ))}
          </View>
          {searchIsPartial ? <Text style={styles.partial}>{t('partialSearchResults')}</Text> : null}
        </View>
        <FlatList
          ref={listRef}
          contentContainerStyle={entries.length ? styles.list : styles.empty}
          data={entries}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query.isPending || search !== searchInput.trim() ? t('loading') : t('noObjects')}
            </Text>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator />
                <Text style={styles.footerText}>{t('loadingMore')}</Text>
              </View>
            ) : null
          }
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          onMomentumScrollEnd={persistScroll}
          onScrollEndDrag={persistScroll}
          renderItem={({ item }) => (
            <BrowserRow
              item={item}
              bucket={bucket}
              profile={server}
              selected={selectedIds.has(item.id)}
              selectionMode={selectionMode}
              onLongPress={selectionAvailable ? () => beginSelection(item) : undefined}
              onOpen={() => {
                if (longPressedIdRef.current === item.id) {
                  longPressedIdRef.current = null;
                  return;
                }
                if (selectionMode) {
                  toggleSelection(item);
                  return;
                }
                if (item.folder) {
                  router.push({
                    pathname: '/(tabs)/files/[bucket]',
                    params: { bucket, prefix: item.key },
                  });
                  return;
                }
                router.push({
                  pathname: '/(tabs)/files/preview',
                  params: { bucket, key: item.key },
                });
              }}
            />
          )}
        />
        {renameVisible ? (
          <RenameObjectDialog
            error={operationError}
            folder={selectedEntries[0]?.folder ?? false}
            onCancel={() => {
              setRenameVisible(false);
              setOperationError(null);
            }}
            onRename={submitRename}
            sourceKey={selectedEntries.length === 1 ? selectedEntries[0].key : null}
            submitting={operation.isPending}
            visible
          />
        ) : null}
        {destinationOperation ? (
          <ObjectDestinationPicker
            buckets={destinationBuckets}
            error={operationError}
            onCancel={() => {
              setDestinationOperation(null);
              setOperationError(null);
            }}
            onSubmit={(destinationBucket, destinationPrefix, overwrite) =>
              submitJob(destinationOperation, destinationBucket, destinationPrefix, overwrite)
            }
            operation={destinationOperation}
            profile={server}
            selectedObjects={selection.objects}
            selectedPrefixes={selection.prefixes}
            sourceBucket={bucket}
            submitting={operation.isPending}
            visible
          />
        ) : null}
      </View>
    </>
  );
}

function SortButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sortButton,
        active && styles.sortButtonActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.sortLabel, active && styles.sortLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function BrowserRow({
  item,
  bucket,
  profile,
  selected,
  selectionMode,
  onLongPress,
  onOpen,
}: {
  item: BrowserEntry;
  bucket: string;
  profile: ServerProfile;
  selected: boolean;
  selectionMode: boolean;
  onLongPress?: () => void;
  onOpen(): void;
}) {
  const date = item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString() : null;
  const detail = item.folder
    ? t('folders')
    : [formatBytes(item.size), date].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityHint={item.folder ? t('openFolder') : t('previewFile')}
      accessibilityLabel={`${selected ? t('deselectItem') : selectionMode ? t('selectItem') : ''} ${item.name}`.trim()}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      delayLongPress={350}
      onLongPress={onLongPress}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, selected && styles.selectedRow, pressed && styles.pressed]}>
      {selectionMode || selected ? (
        <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorSelected]}>
          <Text style={styles.selectionMark}>{selected ? '✓' : ''}</Text>
        </View>
      ) : null}
      {item.folder ? (
        <Text accessibilityElementsHidden style={[styles.glyph, styles.folder]}>▰</Text>
      ) : (
        <ObjectThumbnail
          bucket={bucket}
          contentType={item.contentType}
          objectKey={item.key}
          profile={profile}
          version={item.etag}
        />
      )}
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.detail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function sortLabel(mode: BrowserSortMode): string {
  if (mode === 'date') return t('sortDate');
  if (mode === 'size') return t('sortSize');
  return t('sortName');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  controls: { gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  actionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  selectButton: {
    minWidth: 70,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.fill,
    paddingHorizontal: 14,
  },
  selectButtonLabel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  search: {
    minHeight: 44,
    borderRadius: 11,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    color: colors.label,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  sortGroup: {
    minHeight: 40,
    flexDirection: 'row',
    borderRadius: 10,
    padding: 2,
    backgroundColor: colors.fill,
  },
  sortButton: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  sortButtonActive: { backgroundColor: colors.surface },
  sortLabel: { color: colors.secondaryLabel, fontSize: 14, fontWeight: '600' },
  sortLabelActive: { color: colors.label },
  partial: { color: colors.secondaryLabel, fontSize: 12, lineHeight: 16 },
  list: { paddingHorizontal: 12, paddingBottom: 24, gap: 1 },
  empty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  emptyText: { color: colors.secondaryLabel, fontSize: 17, textAlign: 'center' },
  footer: { minHeight: 54, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  footerText: { color: colors.secondaryLabel, fontSize: 14 },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  selectedRow: { backgroundColor: colors.fill },
  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.secondaryLabel,
  },
  selectionIndicatorSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  selectionMark: { color: 'white', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  glyph: { color: colors.secondaryLabel, fontSize: 22, width: 44, textAlign: 'center' },
  folder: { color: colors.accent },
  rowBody: { flex: 1, gap: 3 },
  name: { color: colors.label, fontSize: 16 },
  detail: { color: colors.secondaryLabel, fontSize: 13 },
});
