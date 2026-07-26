import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { ObjectThumbnail } from '@/features/storage/object-preview/thumbnail';
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
  const [searchInput, setSearchInput] = useState('');
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
  const query = useObjectPages(server, bucket, prefix, search);

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
      <Stack.Screen options={{ title: prefix ? prefix.split('/').filter(Boolean).at(-1) : bucket }} />
      <View style={styles.screen}>
        <View style={styles.controls}>
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
              onOpen={() => {
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
  onOpen,
}: {
  item: BrowserEntry;
  bucket: string;
  profile: ServerProfile;
  onOpen(): void;
}) {
  const date = item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString() : null;
  const detail = item.folder
    ? t('folders')
    : [formatBytes(item.size), date].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityHint={item.folder ? t('openFolder') : t('previewFile')}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
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
  pressed: { opacity: 0.6 },
  glyph: { color: colors.secondaryLabel, fontSize: 22, width: 44, textAlign: 'center' },
  folder: { color: colors.accent },
  rowBody: { flex: 1, gap: 3 },
  name: { color: colors.label, fontSize: 16 },
  detail: { color: colors.secondaryLabel, fontSize: 13 },
});
