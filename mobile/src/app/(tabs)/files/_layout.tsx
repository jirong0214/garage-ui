import { Stack } from 'expo-router';

import { t } from '@/shared/i18n/strings';

export default function FilesLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('buckets'), headerLargeTitle: true }} />
      <Stack.Screen
        name="[bucket]"
        options={({ route }) => ({
          title: String((route.params as { bucket?: string } | undefined)?.bucket ?? ''),
        })}
      />
      <Stack.Screen name="preview" options={{ headerBackButtonDisplayMode: 'minimal' }} />
    </Stack>
  );
}
