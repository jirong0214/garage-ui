import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { useSessionStore } from '@/features/auth/session/session-store';
import { signIn } from '@/infrastructure/api/garage-api';
import { t } from '@/shared/i18n/strings';
import { Field, InlineError, PrimaryButton, Screen } from '@/shared/ui/components';
import { colors } from '@/shared/ui/theme';

const schema = z.object({
  username: z.string().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const server = useSessionStore((state) => state.server);
  const setAuthenticated = useSessionStore((state) => state.setAuthenticated);
  const { control, handleSubmit, setError, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!server) throw new Error('Choose a server first.');
      await signIn(server, data.username, data.password);
    },
    onSuccess() {
      setAuthenticated(true);
      router.replace('/(tabs)/files');
    },
    onError(error) {
      setError('root', { message: error instanceof Error ? error.message : 'Sign in failed.' });
    },
  });

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>{t('login')}</Text>
            <Text numberOfLines={2} style={styles.subtitle}>{server?.baseUrl}</Text>
            {!server?.apiVersion ? <Text style={styles.warning}>{t('legacyApi')}</Text> : null}
          </View>
          <Controller
            control={control}
            name="username"
            render={({ field }) => (
              <Field
                accessibilityLabel={t('username')}
                autoComplete="username"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder={t('username')}
                returnKeyType="next"
                textContentType="username"
                value={field.value}
              />
            )}
          />
          {formState.errors.username?.message ? <InlineError message={formState.errors.username.message} /> : null}
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Field
                accessibilityLabel={t('password')}
                autoComplete="current-password"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                onSubmitEditing={handleSubmit((value) => mutation.mutate(value))}
                placeholder={t('password')}
                returnKeyType="go"
                secureTextEntry
                textContentType="password"
                value={field.value}
              />
            )}
          />
          {formState.errors.password?.message ? <InlineError message={formState.errors.password.message} /> : null}
          {formState.errors.root?.message ? <InlineError message={formState.errors.root.message} /> : null}
          <PrimaryButton
            label={mutation.isPending ? t('signingIn') : t('login')}
            loading={mutation.isPending}
            onPress={handleSubmit((value) => mutation.mutate(value))}
          />
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
  subtitle: { color: colors.secondaryLabel, fontSize: 15 },
  warning: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
});
