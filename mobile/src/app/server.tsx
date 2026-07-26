import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { useSessionStore } from '@/features/auth/session/session-store';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { isDebugLanHttpEnabled } from '@/features/server/configuration/server-runtime';
import { normalizeServerUrl } from '@/features/server/configuration/server-url';
import { testServer } from '@/infrastructure/api/garage-api';
import { saveActiveServer } from '@/infrastructure/database/server-repository';
import { t } from '@/shared/i18n/strings';
import { Field, InlineError, PrimaryButton, Screen } from '@/shared/ui/components';
import { colors } from '@/shared/ui/theme';

const schema = z.object({ url: z.string().min(1) });
type FormData = z.infer<typeof schema>;

export default function ServerScreen() {
  const setServer = useSessionStore((state) => state.setServer);
  const { control, handleSubmit, setError, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { url: '' },
  });
  const mutation = useMutation({
    mutationFn: async ({ url }: FormData) => {
      const baseUrl = normalizeServerUrl(url, isDebugLanHttpEnabled());
      const result = await testServer(baseUrl);
      const profile: ServerProfile = {
        id: `server-${Date.now()}`,
        baseUrl,
        apiVersion: result.health.apiVersion ?? null,
        createdAt: new Date().toISOString(),
      };
      await saveActiveServer(profile);
      return profile;
    },
    onSuccess(profile) {
      setServer(profile);
      router.replace('/login');
    },
    onError(error) {
      setError('url', { message: error instanceof Error ? error.message : 'Connection failed.' });
    },
  });

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>{t('addServer')}</Text>
            <Text style={styles.subtitle}>{t('serverHint')}</Text>
          </View>
          <Controller
            control={control}
            name="url"
            render={({ field }) => (
              <Field
                accessibilityLabel={t('serverUrl')}
                keyboardType="url"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                onSubmitEditing={handleSubmit((value) => mutation.mutate(value))}
                placeholder="https://garage.example.com"
                returnKeyType="go"
                value={field.value}
              />
            )}
          />
          {formState.errors.url?.message ? <InlineError message={formState.errors.url.message} /> : null}
          <PrimaryButton
            label={mutation.isPending ? t('testing') : t('testConnection')}
            loading={mutation.isPending}
            onPress={handleSubmit((value) => mutation.mutate(value))}
          />
          <Text style={styles.security}>Release builds require HTTPS. LAN HTTP is available only in an explicitly configured Debug build.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', gap: 14, padding: 20 },
  heading: { gap: 8, marginBottom: 12 },
  title: { color: colors.label, fontSize: 30, fontWeight: '700' },
  subtitle: { color: colors.secondaryLabel, fontSize: 17, lineHeight: 24 },
  security: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginTop: 4 },
});
