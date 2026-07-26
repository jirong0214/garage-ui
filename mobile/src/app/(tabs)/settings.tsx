import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { authStorage } from '@/features/auth/session/auth-storage';
import { useSessionStore } from '@/features/auth/session/session-store';
import { clearActiveServer } from '@/infrastructure/database/server-repository';
import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

export default function SettingsScreen() {
  const server = useSessionStore((state) => state.server);
  const setServer = useSessionStore((state) => state.setServer);
  const setAuthenticated = useSessionStore((state) => state.setAuthenticated);
  const queryClient = useQueryClient();

  async function signOut() {
    if (server) await authStorage.clearToken(server.id);
    await clearActiveServer();
    queryClient.clear();
    setAuthenticated(false);
    setServer(null);
    router.replace('/server');
  }

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>{t('settings')}</Text>
      <View style={styles.group}>
        <Text style={styles.label}>{t('server')}</Text>
        <Text selectable style={styles.value}>{server?.baseUrl}</Text>
        <View style={styles.separator} />
        <Text style={styles.label}>{t('apiCompatibility')}</Text>
        <Text style={styles.value}>{server?.apiVersion ?? t('legacy')}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
        <Text style={styles.signOutText}>{t('signOut')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, paddingTop: 70, gap: 20, backgroundColor: colors.background },
  title: { color: colors.label, fontSize: 34, fontWeight: '700' },
  group: { borderRadius: 14, backgroundColor: colors.surface, padding: 16, gap: 7 },
  label: { color: colors.secondaryLabel, fontSize: 13, textTransform: 'uppercase' },
  value: { color: colors.label, fontSize: 16, marginBottom: 7 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: 5 },
  signOut: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  signOutText: { color: colors.danger, fontSize: 17, fontWeight: '600' },
});
