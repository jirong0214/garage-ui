import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session/session-store';
import { fetchObjects } from '@/infrastructure/api/garage-api';
import { t } from '@/shared/i18n/strings';
import { InlineError } from '@/shared/ui/components';
import { colors } from '@/shared/ui/theme';

type Entry = { id: string; name: string; detail: string; folder: boolean; key: string };

export default function ObjectListScreen() {
  const parameters = useLocalSearchParams<{ bucket: string; prefix?: string }>();
  const bucket = parameters.bucket;
  const prefix = parameters.prefix ?? '';
  const server = useSessionStore((state) => state.server);
  const query = useQuery({
    queryKey: ['objects', server?.id, bucket, prefix],
    queryFn: () => fetchObjects(server!, bucket, prefix),
    enabled: Boolean(server && bucket),
  });
  const entries: Entry[] = [
    ...(query.data?.prefixes ?? []).map((value) => ({
      id: `prefix:${value}`,
      name: value.slice(prefix.length).replace(/\/$/, ''),
      detail: t('folders'),
      folder: true,
      key: value,
    })),
    ...(query.data?.objects ?? []).map((object) => ({
      id: `object:${object.key}`,
      name: (object.key ?? '').slice(prefix.length),
      detail: formatBytes(object.size ?? 0),
      folder: false,
      key: object.key ?? '',
    })),
  ];

  if (query.isError) {
    return <View style={styles.center}><InlineError message={query.error.message} onRetry={() => void query.refetch()} /></View>;
  }

  return (
    <>
      <Stack.Screen options={{ title: prefix ? prefix.split('/').filter(Boolean).at(-1) : bucket }} />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={entries.length ? styles.list : styles.empty}
        data={entries}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>{query.isPending ? 'Loading…' : t('noObjects')}</Text>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole={item.folder ? 'button' : undefined}
            disabled={!item.folder}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/files/[bucket]',
                params: { bucket, prefix: item.key },
              })
            }
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text accessibilityElementsHidden style={[styles.glyph, item.folder && styles.folder]}>{item.folder ? '▰' : '▤'}</Text>
            <View style={styles.rowBody}>
              <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 1 },
  empty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  emptyText: { color: colors.secondaryLabel, fontSize: 17 },
  row: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  glyph: { color: colors.secondaryLabel, fontSize: 22, width: 28, textAlign: 'center' },
  folder: { color: colors.accent },
  rowBody: { flex: 1, gap: 3 },
  name: { color: colors.label, fontSize: 16 },
  detail: { color: colors.secondaryLabel, fontSize: 13 },
});
