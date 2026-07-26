import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session/session-store';
import { fetchBuckets, fetchCapabilities } from '@/infrastructure/api/garage-api';
import { t } from '@/shared/i18n/strings';
import { InlineError } from '@/shared/ui/components';
import { colors } from '@/shared/ui/theme';

export default function BucketListScreen() {
  const server = useSessionStore((state) => state.server);
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

  if (capabilities.isError) {
    return <View style={styles.center}><InlineError message={capabilities.error.message} onRetry={() => void capabilities.refetch()} /></View>;
  }
  if (buckets.isError) {
    return <View style={styles.center}><InlineError message={buckets.error.message} onRetry={() => void buckets.refetch()} /></View>;
  }

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={buckets.data?.length ? styles.list : styles.empty}
      data={buckets.data ?? []}
      keyExtractor={(item) => item.name ?? ''}
      ListEmptyComponent={<Text style={styles.emptyText}>{buckets.isPending ? t('loading') : t('noBuckets')}</Text>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/(tabs)/files/[bucket]', params: { bucket: item.name ?? '' } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.icon}><Text style={styles.iconText}>▰</Text></View>
          <View style={styles.rowBody}>
            <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
            <Text style={styles.detail}>{item.objectCount ?? 0} {t('objects')}</Text>
          </View>
          <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  empty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  emptyText: { color: colors.secondaryLabel, fontSize: 17 },
  row: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 14, backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.65 },
  icon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  iconText: { color: colors.accent, fontSize: 20 },
  rowBody: { flex: 1, gap: 3 },
  name: { color: colors.label, fontSize: 17, fontWeight: '600' },
  detail: { color: colors.secondaryLabel, fontSize: 14 },
  chevron: { color: colors.secondaryLabel, fontSize: 28 },
});
